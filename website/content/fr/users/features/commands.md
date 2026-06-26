# Commandes

Ce document détaille toutes les commandes prises en charge par Qwen Code, vous aidant à gérer efficacement les sessions, personnaliser l'interface et contrôler son comportement.

Les commandes Qwen Code sont déclenchées via des préfixes spécifiques et se répartissent en trois catégories :

| Type de préfixe                | Description de la fonction                                | Cas d'utilisation typique                                        |
| ------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Commandes Slash (`/`)          | Contrôle méta-niveau de Qwen Code lui-même                | Gestion des sessions, modification des paramètres, aide          |
| Commandes At (`@`)             | Injection rapide du contenu d'un fichier local dans la conversation | Permettre à l'IA d'analyser des fichiers ou du code spécifiques sous des répertoires |
| Commandes Exclamation (`!`)    | Interaction directe avec le Shell système                 | Exécution de commandes système comme `git status`, `ls`, etc.    |

## 1. Commandes Slash (`/`)

Les commandes slash sont utilisées pour gérer les sessions, l'interface et le comportement de base de Qwen Code.

### 1.1 Gestion des sessions et des projets

Ces commandes vous aident à sauvegarder, restaurer et résumer l'avancement du travail.

| Commande        | Description                                                              | Exemples d'utilisation                                            |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `/init`         | Analyser le répertoire courant et créer un fichier de contexte initial   | `/init`                                                           |
| `/summary`      | Générer un résumé de projet basé sur l'historique de la conversation     | `/summary`                                                        |
| `/compress`     | Remplacer l'historique de la conversation par un résumé pour économiser des Tokens | `/compress` ou `/summarize`                                      |
| `/compress-fast`| Compression rapide sans IA — supprime les anciennes sorties d'outils et les parties de raisonnement | `/compress-fast` |
| `/resume`       | Reprendre une session de conversation précédente                         | `/resume` ou `/continue`                                          |
| `/recap`        | Générer un récapitulatif de session en une ligne maintenant              | `/recap`                                                          |
| `/restore`      | Restaurer les fichiers du projet au point de contrôle avant l'exécution d'un appel d'outil | `/restore` (liste) ou `/restore <ID>`            |
| `/delete`       | Supprimer une session précédente                                         | `/delete`                                                         |
| `/branch`       | Forker la conversation courante dans une nouvelle session                | `/branch`                                                         |
| `/fork`         | Lancer un agent en arrière-plan qui hérite de la conversation complète   | `/fork <directive>`                                               |
| `/rewind`       | Revenir à un tour précédent de la conversation                           | `/rewind` ou `/rollback`                                          |
| `/export`       | Exporter l'historique de la session dans un fichier                      | `/export html`, `/export md`, `/export json`, `/export jsonl`     |
| `/rename`       | Renommer ou étiqueter la session courante                                | `/rename My Feature` ou `/tag`                                    |

> [!note]
>
> `/summarize` est un alias pour `/compress` (il compresse l'historique de la conversation — une opération destructive). Pour générer un résumé de projet non destructif à la place, utilisez `/summary`.

### 1.2 Contrôle de l'interface et de l'espace de travail

Commandes pour ajuster l'apparence de l'interface et l'environnement de travail.

| Commande             | Description                                                                                                                                                                       | Exemples d'utilisation                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/clear`             | Effacer l'historique de la conversation et libérer du contexte                                                                                                                    | `/clear`, `/reset`, `/new`                                                               |
| `/context`           | Afficher la répartition de l'utilisation de la fenêtre de contexte                                                                                                                | `/context`                                                                               |
| → `detail`           | Afficher la répartition de l'utilisation du contexte par élément                                                                                                                  | `/context detail`                                                                        |
| `/history`           | Contrôler les préférences d'affichage de l'historique et la visibilité                                                                                                            | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`        |
| `/diff`              | Ouvrir un visualiseur de différences interactif montrant les modifications non commitées et les différences par tour. Utilisez ←/→ pour basculer entre le diff git courant et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers | `/diff` |
| `/theme`             | Changer le thème visuel de Qwen Code                                                                                                                                              | `/theme`                                                                                 |
| `/vim`               | Activer/désactiver le mode d'édition Vim de la zone de saisie                                                                                                                     | `/vim`                                                                                   |
| `/voice`             | Activer/désactiver la saisie par dictée vocale                                                                                                                                    | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`                     |
| `/directory`         | Gérer l'espace de travail multi-répertoires                                                                                                                                       | `/dir add ./src,./tests`, `/dir show`                                                    |
| `/cd`                | Déplacer cette session vers un nouveau répertoire de travail                                                                                                                      | `/cd ../other-project`                                                                   |
| `/editor`            | Ouvrir la boîte de dialogue pour sélectionner un éditeur pris en charge                                                                                                           | `/editor`                                                                                |
| `/statusline`        | Ouvrir la boîte de dialogue interactive des préréglages de [barre d'état](./status-line.md)                                                                                       | `/statusline`                                                                            |
| `/statusline <text>` | Générer une [barre d'état](./status-line.md) en mode commande via un agent                                                                                                        | `/statusline show model and git branch`                                                  |
| `/terminal-setup`    | Configurer les raccourcis clavier du terminal pour la saisie multiligne                                                                                                           | `/terminal-setup`                                                                        |

### 1.3 Paramètres de langue

Commandes spécifiquement pour contrôler la langue de l'interface et de la sortie.

| Commande              | Description                      | Exemples d'utilisation          |
| --------------------- | -------------------------------- | ------------------------------- |
| `/language`           | Voir ou modifier les paramètres de langue | `/language`             |
| → `ui [langue]`       | Définir la langue de l'interface utilisateur | `/language ui zh-CN`    |
| → `output [langue]`   | Définir la langue de sortie du LLM | `/language output Chinese`      |

- Langues d'interface intégrées disponibles : `zh-CN` (Chinois simplifié), `en-US` (Anglais), `ru-RU` (Russe), `de-DE` (Allemand), `ja-JP` (Japonais), `pt-BR` (Portugais - Brésil), `fr-FR` (Français), `ca-ES` (Catalan)
- Exemples de langues de sortie : `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gestion des outils et des modèles

Commandes pour gérer les outils et modèles d'IA.

| Commande         | Description                                          | Exemples d'utilisation                                                                                        |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/mcp`           | Lister les serveurs MCP et outils configurés         | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                             |
| `/import-config` | Importer des serveurs MCP depuis les configurations Claude | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`         | Afficher la liste des outils disponibles             | `/tools`, `/tools desc`                                                                                       |
| `/skills`        | Lister et exécuter les compétences disponibles        | `/skills`, `/skills <nom>`                                                                                    |
| `/plan`          | Passer en mode planification ou quitter le mode planification | `/plan`, `/plan <tâche>`, `/plan exit`                                                              |
| `/approval-mode` | Changer le mode d'approbation des outils (session courante uniquement) | `/approval-mode`, `/approval-mode auto-edit`                                          |
| → `plan`         | Analyse uniquement, pas d'exécution (revue sécurisée) | `/approval-mode plan`                                                                                         |
| → `default`      | Nécessiter une approbation pour les modifications (usage quotidien) | `/approval-mode default`                                                                           |
| → `auto-edit`    | Approuver automatiquement les modifications (environnement de confiance) | `/approval-mode auto-edit`                                                                         |
| → `auto`         | Approbation évaluée par classifieur (autonome)        | `/approval-mode auto`                                                                                         |
| → `yolo`         | Approuver automatiquement tout (prototypage rapide)   | `/approval-mode yolo`                                                                                         |
| `/model`         | Changer de modèle dans la session courante            | `/model`, `/model <model-id>` (changement immédiat)                                                           |
| `/model --fast`  | Définir un modèle plus léger pour les suggestions d'invite | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice` | Définir le modèle utilisé pour la transcription vocale | `/model --voice <model-id>`                                                                                   |
| `/extensions`    | Gérer les extensions                                 | `/extensions list`, `/extensions manage`                                                                      |
| → `list`         | Lister les extensions installées                     | `/extensions list`                                                                                            |
| → `manage`       | Gérer les extensions installées (interactif)         | `/extensions manage`                                                                                          |
| → `explore`      | Ouvrir la page des extensions dans le navigateur     | `/extensions explore <Gemini\|ClaudeCode>`                                                                     |
| → `install`      | Installer une extension depuis un dépôt git ou un chemin | `/extensions install <repo-or-path>`                                                                      |
| `/memory`        | Ouvrir la boîte de dialogue du Gestionnaire de Mémoire | `/memory`                                                                                                   |
| `/remember`      | Sauvegarder une mémoire durable                       | `/remember Prefer terse responses`                                                                            |
| `/forget`        | Supprimer les entrées correspondantes de la mémoire automatique | `/forget <requête>`                                                                                  |
| `/dream`         | Exécuter manuellement la consolidation de la mémoire automatique | `/dream`                                                                                            |
| `/hooks`         | Gérer les hooks Qwen Code                            | `/hooks`, `/hooks list`                                                                                       |
| `/permissions`   | Gérer les règles de permissions                      | `/permissions`                                                                                                |
| `/agents`        | Gérer les sous-agents                                | `/agents manage`, `/agents create`                                                                            |
| `/arena`         | Gérer les sessions Arena                             | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`)                               |
| `/goal`          | Définir un objectif — continuer jusqu'à ce que la condition soit remplie | `/goal <condition>`, `/goal clear`                                                       |
| `/tasks`         | Lister les tâches en arrière-plan                    | `/tasks`                                                                                                      |
| `/workflows`     | Inspecter les exécutions de workflows                | `/workflows`, `/workflows <runId>`                                                                            |
| `/lsp`           | Afficher le statut du serveur LSP                    | `/lsp`                                                                                                        |
| `/trust`         | Gérer les paramètres de confiance des dossiers       | `/trust`                                                                                                      |

> [!warning]
>
> Installez uniquement des extensions (`/extensions install`) provenant de sources de confiance. Les extensions peuvent inclure des serveurs MCP, des compétences et des commandes qui s'exécutent avec les mêmes permissions que Qwen Code lui-même — elles peuvent accéder à vos fichiers, clés API et données de conversation. `/extensions install` ne demande pas de confirmation.

> [!warning]
>
> Les modes d'approbation `auto-edit`, `auto` et `yolo` contournent les demandes d'approbation pour les exécutions d'outils. En mode `yolo`, toutes les actions — y compris les commandes shell, les écritures de fichiers et les requêtes réseau — s'exécutent sans confirmation. Utilisez ces modes uniquement dans des environnements de confiance, isolés ou jetables.

> [!note]
>
> `/workflows`, `/lsp` et `/trust` sont enregistrés uniquement lorsque leur fonctionnalité est activée — via la variable d'environnement `QWEN_CODE_ENABLE_WORKFLOWS=1`, le flag CLI `--experimental-lsp` et le paramètre `security.folderTrust.enabled` respectivement. Lorsqu'ils sont désactivés, ils n'apparaissent pas et signaleront une commande inconnue.

### 1.5 Compétences intégrées

Ces commandes invoquent des compétences fournies qui offrent des workflows spécialisés.

| Commande     | Description                                                         | Exemples d'utilisation                                |
| ------------ | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `/review`    | Examiner les modifications de code avec 5 agents parallèles + analyse déterministe | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Exécuter une invite selon un calendrier récurrent                   | `/loop 5m check the build`                            |
| `/simplify`  | Examiner les modifications récentes et appliquer directement des nettoyages sécurisés | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Répondre aux questions sur l'utilisation et la configuration de Qwen Code | `/qc-helper how do I configure MCP?`          |

Voir [Révision de code](./code-review.md) pour la documentation complète de `/review`.

### 1.6 Question secondaire (`/btw`)

La commande `/btw` vous permet de poser des questions secondaires rapides sans interrompre ou affecter le flux principal de la conversation.

| Commande               | Description                           |
| ---------------------- | ------------------------------------- |
| `/btw <votre question>`| Poser une question secondaire rapide  |
| `?btw <votre question>`| Syntaxe alternative pour les questions secondaires |

**Comment ça fonctionne :**

- La question secondaire est envoyée comme un appel API séparé avec le contexte de la conversation récente (jusqu'aux 20 derniers messages)
- La réponse s'affiche au-dessus du Composer — vous pouvez continuer à taper en attendant
- La conversation principale **n'est pas bloquée** — elle continue indépendamment
- La réponse à la question secondaire ne **fait pas** partie de l'historique de la conversation principale
- Les réponses sont rendues avec le support complet de Markdown (blocs de code, listes, tableaux, etc.)

**Raccourcis clavier (Mode interactif) :**

| Raccourci            | Action                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Annuler (pendant le chargement) ou fermer (après complétion) |
| `Space` ou `Enter`   | Fermer la réponse (lorsque la saisie est vide)      |
| `Ctrl+C` ou `Ctrl+D` | Annuler une question secondaire en cours             |

**Exemple :**

```
(Pendant que la conversation principale porte sur du refactoring de code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Le Composer reste actif — continuez à taper)

(Après l'arrivée de la réponse)

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
  > (Composer toujours actif)
```
**Modes d'exécution pris en charge :**

| Mode                 | Comportement                                     |
| -------------------- | ------------------------------------------------ |
| Interactif           | Affiche au-dessus du Composer avec rendu Markdown |
| Non interactif       | Renvoie un résultat textuel : `btw> question\nanswer` |
| ACP (Agent Protocol) | Renvoie un générateur asynchrone stream_messages      |

> [!tip]
>
> Utilisez `/btw` lorsque vous avez besoin d'une réponse rapide sans perturber votre tâche principale. C'est particulièrement utile pour clarifier des concepts, vérifier des faits ou obtenir des explications rapides tout en restant concentré sur votre flux de travail principal.

### 1.7 Récapitulatif de session (`/recap`)

La commande `/recap` génère un court résumé « là où vous en étiez » de la session
en cours, afin que vous puissiez reprendre une ancienne conversation sans faire défiler
des pages d'historique.

| Commande  | Description                                |
| -------- | ------------------------------------------ |
| `/recap` | Génère et affiche un récapitulatif de session d'une ligne |

**Fonctionnement :**

- Utilise le modèle rapide configuré (option `fastModel`) lorsqu'il est disponible, en
  revenant au modèle de session principal. Un petit modèle peu coûteux suffit pour un récapitulatif.
- La conversation récente (jusqu'à 30 messages, texte uniquement — les appels d'outils et
  les réponses d'outils sont filtrés) est envoyée au modèle avec une invite système concise.
- Le récapitulatif est affiché dans une couleur atténuée avec un préfixe `❯` pour qu'il se distingue
  des vraies réponses de l'assistant.
- Refuse avec une erreur en ligne si un tour de modèle est en cours ou si une autre commande
  est en cours de traitement. S'il n'y a pas de conversation exploitable, ou si la génération
  sous-jacente échoue, `/recap` affiche un court message d'information au lieu d'un récapitulatif —
  la commande manuelle répond toujours avec quelque chose.

**Déclenchement automatique au retour d'absence :**

Si le terminal est flouté pendant **5 minutes ou plus** et qu'il est à nouveau ciblé, un récapitulatif
est généré et affiché automatiquement (uniquement lorsqu'aucune réponse de modèle n'est en cours ;
sinon il attend la fin du tour en cours puis se déclenche). Contrairement à la commande manuelle,
le déclenchement automatique est totalement silencieux en cas d'échec : si la génération échoue
ou s'il n'y a rien à résumer, aucun message n'est ajouté à l'historique. Contrôlé par le paramètre
`general.showSessionRecap` (par défaut : `false`) ; la commande manuelle `/recap` fonctionne
toujours indépendamment de ce paramètre.

**Exemple :**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Configurez un modèle rapide via `/model --fast <model>` (par exemple
> `qwen3-coder-flash`) pour rendre `/recap` rapide et peu coûteux. Définissez
> `general.showSessionRecap` sur `true` pour activer le déclenchement automatique ; la
> commande manuelle `/recap` fonctionne toujours indépendamment de ce paramètre.

### 1.8 Visionneuse de diff (`/diff`)

La commande `/diff` ouvre une visionneuse de diff interactive montrant les modifications non commitées et les diffs par tour. Utilisez ←/→ pour basculer entre le diff git actuel et les tours de conversation individuels, ↑/↓ pour parcourir les fichiers, et Entrée pour voir les diffs en ligne.

**Fonctionnement :**

En mode interactif, `/diff` ouvre une boîte de dialogue avec un **sélecteur de source** en haut :

- **Courant** — arbre de travail vs HEAD (`git diff HEAD`). Affiche toutes les modifications non commitées, y compris les fichiers indexés, non indexés et non suivis.
- **T1, T2, T3, …** — diffs par tour, un onglet par tour de modèle ayant modifié des fichiers. Les tours les plus récents apparaissent en premier. Chaque onglet montre un aperçu de l'invite originale pour le contexte.

La liste des fichiers affiche des statistiques par fichier (lignes ajoutées/supprimées) avec des étiquettes pour les états spéciaux (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Appuyez sur Entrée sur un fichier pour voir son diff en ligne avec des blocs surlignés syntaxiquement.

Les diffs par tour nécessitent que la sauvegarde de point de contrôle des fichiers soit activée (activée par défaut en mode interactif). Lorsque la sauvegarde de point de contrôle est désactivée, seule la source « Courant » est disponible.

**Raccourcis clavier :**

| Touche     | Action                                      |
| --------- | ------------------------------------------- |
| `←` / `→` | Basculer entre les sources (Courant / T1 / T2…) |
| `↑` / `↓` | Naviguer dans la liste des fichiers                          |
| `j` / `k` | Naviguer dans la liste des fichiers (style vim)              |
| Entrée     | Afficher le diff en ligne pour le fichier sélectionné          |
| `←` / Esc | Revenir à la liste des fichiers depuis la vue diff en ligne   |
| Esc       | Fermer la boîte de dialogue                                     |

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

Dans les contextes headless (`--prompt`) ou non interactifs, `/diff` imprime un résumé en texte brut de l'arbre de travail vs HEAD. La navigation par tour n'est pas disponible.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informations, paramètres et aide

Commandes pour obtenir des informations et effectuer des réglages système.

| Commande          | Description                                                                                                                    | Exemples d'utilisation                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | Affiche les informations d'aide pour les commandes disponibles                                                                                | `/help` ou `/?`                                                                     |
| `/status`        | Affiche les informations de version                                                                                                    | `/status` ou `/about`                                                               |
| `/status paths`  | Affiche les chemins du fichier de session et des journaux actuels                                                                                     | `/status paths`                                                                     |
| `/stats`         | Ouvre le tableau de bord interactif des statistiques d'utilisation (onglets Session, Activité et Efficacité)                                       | `/stats` ou `/usage`                                                                |
| `/stats model`   | Affiche la répartition des jetons par modèle et le coût estimé                                                                              | `/stats model`                                                                      |
| `/stats tools`   | Affiche le nombre d'appels par outil                                                                                                      | `/stats tools`                                                                      |
| `/stats skills`  | Affiche le nombre d'appels par compétence pour la session en direct actuelle (direct uniquement ; exclut l'activité quotidienne/mensuelle inter-sessions)             | `/stats skills`                                                                     |
| `/stats daily`   | Affiche les statistiques d'utilisation quotidienne des jetons                                                                                              | `/stats daily` (alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Affiche les statistiques d'utilisation mensuelle des jetons                                                                                            | `/stats monthly` (alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exporte les statistiques d'utilisation vers CSV ou JSON                                                                                         | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Ouvre l'éditeur de paramètres                                                                                                           | `/settings`                                                                         |
| `/auth`          | Modifie la méthode d'authentification                                                                                                   | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Exécute les diagnostics d'installation et d'environnement                                                                                   | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Affiche les diagnostics de mémoire du processus actuel                                                                                        | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Enregistre un profil CPU pour l'analyse Chrome DevTools                                                                              | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Revenir à la version précédente du binaire CLI autonome (installations autonomes uniquement ; pour l'historique des conversations, utilisez `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Ouvre la documentation complète de Qwen Code dans le navigateur                                                                             | `/docs`                                                                             |
| `/ide`           | Gère l'intégration IDE                                                                                                         | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Génère des insights de programmation à partir de l'historique des discussions                                                                                | `/insight`                                                                          |
| `/setup-github`  | Configure GitHub Actions                                                                                                          | `/setup-github`                                                                     |
| `/bug`           | Soumet un problème concernant Qwen Code                                                                                                                    | `/bug Button click unresponsive`                                                    |
| `/copy`          | Copie dans le presse-papiers : réponse (N-ième dernière), code (par langage), LaTeX ou Mermaid                                                         | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Quitte Qwen Code immédiatement                                                                                                     | `/quit` ou `/exit`                                                                  |

> [!warning]
>
> `/doctor memory --snapshot` écrit un instantané du tas V8 qui peut contenir des invites, des contenus de fichiers, des clés API et des résultats d'outils de la session en cours. Examinez le fichier avant de le partager.

### 1.10 Raccourcis courants

| Raccourci           | Fonction                | Note                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Efface l'écran            | Efface l'écran visible uniquement (ne réinitialise pas la session comme `/clear`) |
| `Ctrl/cmd+T`       | Afficher/masquer la description de l'outil | Gestion des outils MCP                                                       |
| `Ctrl/cmd+C`×2     | Confirmation de sortie       | Mécanisme de sortie sécurisé                                                     |
| `Ctrl/cmd+Z`       | Annuler la saisie              | Édition de texte                                                              |
| `Ctrl/cmd+Shift+Z` | Rétablir la saisie              | Édition de texte                                                              |

### 1.11 Commandes d'authentification

Utilisez `/auth` dans une session Qwen Code pour configurer l'authentification. Utilisez `/doctor` pour inspecter l'état actuel de l'authentification et de l'environnement.

| Commande   | Description                                                            |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | Configure l'authentification de manière interactive (alias : `/connect`, `/login`) |
| `/doctor` | Affiche les vérifications d'authentification et d'environnement             |

> [!note]
>
> La commande CLI autonome `qwen auth` a été supprimée. Les invocations héritées comme `qwen auth status` affichent un avis de suppression avec des conseils de migration. Consultez la page [Authentification](../configuration/auth) pour plus de détails.

## 2. Commandes @ (Introduction de fichiers)

Les commandes @ sont utilisées pour ajouter rapidement le contenu d'un fichier ou d'un répertoire local à la conversation.

| Format de commande      | Description                                  | Exemples                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Injecte le contenu du fichier spécifié             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Lit récursivement tous les fichiers texte du répertoire | `@docs/ Summarize content of this document`      |
| `@` seul      | Utilisé lorsque l'on discute du symbole `@` lui-même       | `@ What is this symbol used for in programming?` |

Remarque : Les espaces dans les chemins doivent être échappés avec une barre oblique inversée (par exemple, `@My\ Documents/file.txt`)

## 3. Commandes Exclamation (`!`) - Exécution de commandes Shell

Les commandes Exclamation vous permettent d'exécuter des commandes système directement dans Qwen Code.

| Format de commande     | Description                                                        | Exemples                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Exécute la commande dans un sous-Shell                                       | `!ls -la`, `!git status`               |
| `!` seul     | Bascule en mode Shell, toute saisie est exécutée directement comme commande Shell | `!`(entrée) → Saisir commande → `!`(sortie) |

Variables d'environnement : Les commandes exécutées via `!` définiront la variable d'environnement `QWEN_CODE=1`.

## 4. Commandes personnalisées

Enregistrez les invites fréquemment utilisées comme commandes de raccourci pour améliorer l'efficacité du travail et assurer la cohérence.

> [!note]
>
> Les commandes personnalisées utilisent désormais le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais toujours pris en charge pour la rétrocompatibilité. Lorsque des fichiers TOML sont détectés, une invite de migration automatique sera affichée.

### Aperçu rapide

| Fonction         | Description                                | Avantages                             | Priorité | Scénarios applicables                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Espace de noms        | Le sous-répertoire crée des commandes nommées avec deux-points  | Meilleure organisation des commandes          |          |                                                      |
| Commandes globales  | `~/.qwen/commands/`                        | Disponibles dans tous les projets              | Faible      | Commandes personnelles fréquemment utilisées, utilisation inter-projets |
| Commandes de projet | `<répertoire racine du projet>/.qwen/commands/` | Spécifiques au projet, versionnables | Élevée     | Partage d'équipe, commandes spécifiques au projet      |

Règles de priorité : Commandes de projet > Commandes utilisateur (la commande de projet est utilisée lorsque les noms sont identiques)

### Règles de nommage des commandes

#### Table de correspondance chemin de fichier vers nom de commande

| Emplacement du fichier                            | Commande générée | Exemple d'appel          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

Règles de nommage : Séparateur de chemin (`/` ou `\`) converti en deux-points (`:`)

### Spécification du format de fichier Markdown (recommandé)

Les commandes personnalisées utilisent des fichiers Markdown avec un frontmatter YAML optionnel :

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| Champ         | Requis | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description: Code analysis tool`          |
| Corps de l'invite   | Requis   | Contenu de l'invite envoyé au modèle             | Tout contenu Markdown après le frontmatter |

### Format de fichier TOML (déprécié)

> [!warning]
>
> **Déprécié :** Le format TOML est toujours pris en charge mais sera supprimé dans une future version. Veuillez migrer vers le format Markdown.

| Champ         | Requis | Description                              | Exemple                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Requis   | Contenu de l'invite envoyé au modèle             | `prompt = "Please analyze code: {{args}}"` |
| `description` | Optionnel | Description de la commande (affichée dans /help) | `description = "Code analysis tool"`       |

### Mécanisme de traitement des paramètres

| Méthode de traitement            | Syntaxe             | Scénarios applicables                 | Fonctionnalités de sécurité                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injection contextuelle      | `{{args}}`         | Nécessite un contrôle précis des paramètres       | Échappement automatique du Shell               |
| Traitement par défaut des paramètres | Aucun marquage spécial | Commandes simples, ajout de paramètres | Ajout tel quel                           |
| Injection de commande Shell      | `!{command}`       | Nécessite un contenu dynamique         | Confirmation d'exécution requise avant |

#### 1. Injection contextuelle (`{{args}}`)

| Scénario         | Configuration TOML                      | Méthode d'appel           | Effet réel            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injection brute    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Dans une commande Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Exécute `grep "hello" .` |

#### 2. Traitement par défaut des paramètres

| Situation d'entrée | Méthode de traitement                                      | Exemple                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| A des paramètres  | Ajout à la fin de l'invite (séparé par deux sauts de ligne) | `/cmd parameter` → Invite originale + paramètre |
| Pas de paramètres | Envoyer l'invite telle quelle                                      | `/cmd` → Invite originale                       |
🚀 Injection de contenu dynamique

| Type d'injection          | Syntaxe         | Ordre de traitement | Objectif                               |
| ------------------------- | --------------- | ------------------- | -------------------------------------- |
| Contenu de fichier        | `@{file path}`  | Traité en premier   | Injecter des fichiers de référence statiques |
| Commandes Shell           | `!{command}`    | Traité au milieu    | Injecter les résultats d'exécution dynamiques |
| Remplacement de paramètres | `{{args}}`      | Traité en dernier   | Injecter les paramètres utilisateur    |

#### 3. Exécution de commande Shell (`!{...}`)

| Opération                            | Interaction utilisateur |
| ------------------------------------ | ----------------------- |
| 1. Analyser la commande et les paramètres | -                       |
| 2. Échappement automatique Shell     | -                       |
| 3. Afficher la boîte de dialogue de confirmation | ✅ Confirmation utilisateur |
| 4. Exécuter la commande              | -                       |
| 5. Injecter la sortie dans le prompt | -                       |

Exemple : Génération de message de commit Git

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. Injection de contenu de fichier (`@{...}`)

| Type de fichier | Statut de support          | Méthode de traitement          |
| --------------- | -------------------------- | ------------------------------ |
| Fichiers texte  | ✅ Support complet          | Injecter directement le contenu |
| Images/PDF      | ✅ Support multimodal       | Encoder et injecter            |
| Fichiers binaires | ⚠️ Support limité         | Peut être ignoré ou tronqué    |
| Répertoire      | ✅ Injection récursive      | Suivre les règles .gitignore   |

Exemple : Commande de revue de code

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Exemple pratique de création

#### Tableau des étapes de création de la commande « Refactorisation de fonction pure »

| Opération                         | Commande/Code                               |
| --------------------------------- | ------------------------------------------- |
| 1. Créer la structure de répertoires | `mkdir -p ~/.qwen/commands/refactor`        |
| 2. Créer le fichier de commande   | `touch ~/.qwen/commands/refactor/pure.md`   |
| 3. Modifier le contenu de la commande | Se référer au code complet ci-dessous.      |
| 4. Tester la commande             | `@file.js` → `/refactor:pure`               |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### Résumé des bonnes pratiques pour les commandes personnalisées

#### Tableau des recommandations de conception de commandes

| Points de pratique       | Approche recommandée                       | À éviter                                    |
| ------------------------ | ------------------------------------------ | ------------------------------------------- |
| Nommage des commandes    | Utiliser des espaces de noms pour l'organisation | Éviter les noms trop génériques             |
| Traitement des paramètres | Utiliser clairement `{{args}}`            | Se fier à l'ajout par défaut (facile à confondre) |
| Gestion des erreurs      | Utiliser la sortie d'erreur Shell          | Ignorer les échecs d'exécution              |
| Organisation des fichiers | Organiser par fonction dans des répertoires | Toutes les commandes dans le répertoire racine |
| Champ Description        | Toujours fournir une description claire    | Se fier à la description auto-générée        |

#### Tableau de rappel des fonctionnalités de sécurité

| Mécanisme de sécurité | Effet de protection               | Action utilisateur              |
| --------------------- | --------------------------------- | ------------------------------- |
| Échappement Shell    | Empêcher l'injection de commandes | Traitement automatique          |
| Confirmation d'exécution | Éviter les exécutions accidentelles | Confirmation par dialogue       |
| Signalement d'erreurs | Aider à diagnostiquer les problèmes | Consulter les informations d'erreur |

## 5. Sous-commandes CLI

Ces commandes sont exécutées depuis le shell en tant que `qwen <sous-commande>` avant de démarrer une session interactive.

### Gestion des sessions

| Commande             | Description                              | Exemples d'utilisation                                |
| -------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `qwen sessions list` | Lister les sessions de conversation récentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Liste vos sessions Qwen Code récentes avec leurs métadonnées.

**Options :**

| Option     | Type    | Défaut  | Description                                          |
| ---------- | ------- | ------- | ---------------------------------------------------- |
| `--json`   | booléen | `false` | Sortie en JSON Lines (un objet JSON par ligne)       |
| `--limit`  | nombre  | `20`    | Nombre maximum de sessions à afficher                |

**Sortie lisible par l'humain (par défaut) :**

Un tableau avec les colonnes : SESSION ID, STARTED (horodatage UTC), TITLE, BRANCH, PROMPT.

**Sortie JSON (`--json`) :**

Produit des JSON Lines sur stdout. Chaque ligne est un objet JSON avec les champs :

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

L'indication « a plus de sessions » est émise via stderr pour que le pipe vers `jq` reste sûr.

**Exemples :**

```bash
# Afficher les 20 dernières sessions (par défaut)
qwen sessions list

# Afficher les 50 dernières sessions
qwen sessions list --limit 50

# Sortie en JSON pour le scripting
qwen sessions list --json | jq .
```
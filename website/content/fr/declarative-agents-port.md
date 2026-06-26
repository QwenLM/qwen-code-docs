# Définitions d'agent déclaratives — Portage depuis Claude Code 2.1.168

Document de conception interne pour le portage du schéma d'agent déclaratif de Claude Code (Markdown + frontmatter YAML) vers qwen-code, traitant l'issue [#4821][i4821] et en coordination avec le portage de workflow dans l'issue [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## État d'implémentation (découpé verticalement)

La PR [#4842][p4842] a livré les champs avec un chemin d'exécution de bout en bout à l'époque. La PR [#4870][p4870] a ensuite remplacé le parseur YAML pour prendre en charge les scalaires blocs. Cette PR de suivi s'appuie sur les deux : elle remplace le **stringifier** YAML (la PR #4870 l'avait laissé fait maison — voir `docs/yaml-parser-replacement.md`), expose `mcpServers` + `hooks` sur `SubagentConfig`, et les connecte à l'exécution afin que les serveurs MCP et hooks par agent se déclenchent effectivement lorsqu'un sous-agent s'exécute.

| Champ             | Statut                    | Notes                                                                                                                                                               |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **livré (#4842)**         | fait le pont avec le `approvalMode` existant de qwen au moment de l'analyse                                                                                         |
| `maxTurns`        | **livré (#4842)**         | relié au chemin d'exécution existant `runConfig.max_turns`                                                                                                          |
| Liste blanche `color` | **livré (#4842)**     | resserre le champ existant sur l'ensemble `_Y` de CC + gestion de l'ancien sentinelle `auto`                                                                        |
| `mcpServers`      | **livré (suivi)**         | YAML imbriqué aller-retour sécurisé via le stringifier eemeli/`yaml` ; l'écrasement à l'exécution fusionne les serveurs de session et d'agent via le wrapper Config du sous-agent + reconstruction forcée du registre d'outils |
| `hooks`           | **livré (suivi)**         | Entrées éphémères de HookRegistry enregistrées à la création du sous-agent, supprimées via `onStop` ; v1 se déclenche globalement (pas de filtre par portée d'agent) |
| `effort`          | reporté                   | aucun paramètre `effort` au niveau du modèle n'existe encore dans les fournisseurs qwen                                                                              |
| `memory`          | reporté                   | l'auto-mémoire de qwen n'a pas encore de distinction de portée `user`/`project`/`local`                                                                             |
| `isolation`       | reporté                   | la PR de workflow #4732 gère l'exécution ; la valeur par défaut par agent arrivera quand celle-ci arrivera                                                            |
| `initialPrompt`   | reporté                   | nécessite le drapeau CLI `--agent` (pas d'infrastructure d'agent de session principale dans qwen)                                                                   |
| `skills`          | reporté                   | nécessite la consommation de `config.skills` par SkillManager                                                                                                       |

L'enregistrement complet de rétro-ingénierie ci-dessous est conservé comme référence de conception pour les champs reportés — les constantes de schéma, la sémantique DL7/Ig5, les messages d'erreur et la matrice de coordination avec le workflow restent déterminants pour ce travail.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Phase 0 — Périmètres

| Élément                     | Valeur                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Dernier amont vérifié       | Claude Code **2.1.168** (l'issue #4821 référence ≥ 2.1.167, nous sommes un cran au-dessus)                                              |
| Binaire natif               | `/private/tmp/cc-2.1.168/package/claude` (220 Mo)                                                                                        |
| Extraction des chaînes      | `/private/tmp/cc-2.1.168/claude.strings` (~342 k lignes)                                                                                 |
| Arbre de travail            | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| Branche                     | `lazzy/gifted-hamilton-684741` issue de `main @ 45efb1d3a`                                                                               |
| Hors périmètre              | Code de workflow PR #4732 (arbre séparé `lazzy/lucid-pare-974192`) — coordination uniquement par interface                               |
| Règle de rédaction          | L'auteur est **LaZzyMan** ; **aucun** `Co-Authored-By` ou en-tête d'outil IA dans les commits, PRs, issues ou commentaires (selon `~/.claude/CLAUDE.md`) |

---

## Phase 1 — Résultats de rétro-ingénierie

Toutes les affirmations ici ont été vérifiées indépendamment par grep dans `claude.strings` et ont survécu à une réfutation contradictoire. Niveaux de confiance : **C** = Confirmé (preuve binaire directe), **I** = Inféré (synthétisé à partir de plusieurs faits confirmés), **O** = Ouvert (encore incertain).

### Schéma — les 15 champs, réfutés et reconfirmés

Le schéma d'ombre du frontmatter d'agent est `Ig5`, utilisé dans `ug5.agent` pour la télémétrie `tengu_frontmatter_shadow_unknown_key` / `_mismatch`. Le **chargeur de production est `DL7`** (`parseAgentFromMarkdown`), qui effectue une validation champ par champ faite main avec des messages d'erreur personnalisés. Un **schéma JSON séparé `JL7`** (utilisé par `fL7` / `parseAgentFromJson`) est plus strict, mais constitue un chemin de code différent (utilisé par `--agents <json>` et `settings.agents`).

| #   | Champ             | Type (Ig5 / DL7)                        | Obligatoire | Défaut        | Enum / Contrainte                                                                                                                       | Conf                                        |
| --- | ----------------- | --------------------------------------- | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | string, non vide                        | **oui**     | —             | aucun — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                  | **C** strings:308120, 309074                |
| 2   | `description`     | string, non vide                        | **oui**     | —             | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | string                                  | non         | undefined     | `inherit` (insensible à la casse) normalisé en littéral `"inherit"` ; sinon pass-through après suppression des espaces                   | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | string\|array (union MDH)               | non         | undefined     | jeton unique `*` → `undefined` (signifie « hériter de tout ») ; dédoublonné via `AXH`/`FbK`                                              | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | string\|array (MDH)                     | non         | undefined     | « Ignoré si `tools` est défini » (d'après le texte de description) ; appliqué par les appelants                                         | **C** strings:308120, 309075                |
| 6   | `effort`          | string\|entier                          | non         | undefined     | enum `GN=["low","medium","high","xhigh","max"]` OU `int` ; alias `P37={med:"medium"}`                                                   | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | string                                  | non         | undefined     | enum `$E = Gmq = [...kc]` où `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 valeurs)                     | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5) ; `array(jL7)` (JL7)| non         | undefined     | chaque élément : string OU `record(string, MCPServerSpec)` ; `safeParse` par élément dans DL7                                            | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5) ; `_u()` (JL7)      | non         | undefined     | validé paresseusement à l'exécution via `TKO` → `_u().safeParse` (forme des hooks de settings.json)                                    | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | non         | undefined     | entier positif (analysé par `W46` — accepte numérique ou chaîne numérique)                                                              | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | string\|array (MDH)                     | non         | `[]` (émis)   | normalisé via `ml(q.skills) = FbK(H) ?? []` ; pas de caractère générique `*` (contrairement à `tools`)                                  | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | string                                  | non         | undefined     | que des espaces → undefined ; uniquement soumis automatiquement lorsque l'agent est la **session principale** (via `--agent` / settings), ignoré comme sous-agent | **C** strings:308120, 309075 |
| 13  | `memory`          | string                                  | non         | undefined     | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | string\|bool (eiH=EL8)                  | non         | undefined     | accepte `true` / `false` / `"true"` / `"false"` ; seule la valeur vraie est normalisée en `true`, sinon `undefined`                     | **C** strings:308120, 309075                |
| 15  | `isolation`       | string                                  | non         | undefined     | enum **uniquement** `["worktree"]` (PAS `["none","worktree"]` — c'est un schéma différent à strings:313284 pour les paramètres de session en arrière-plan) | **C** strings:308120, 309075, 309076        |

Observation subtile ayant survécu à la réfutation : même si `skills` est « optionnel », la clause d'émission de DL7 est `...I !== void 0 && {skills: I}` et `ml(undefined)` retourne `[]` (non-undefined), donc **l'enregistrement émis final portera `skills: []` même lorsque le frontmatter omet le champ**. Cela affecte les vérifications d'égalité en aval — à signaler pour le portage qwen-code.

### Champs supplémentaires possibles au-delà des 15

| #   | Champ        | Type   | Défaut   | Enum / Contrainte                                                                                                                                                                                                                                                            | Conf                                     |
| --- | ------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`**  | string | undefined | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]` ; décrit comme `"@internal — display color in the agents UI"` ; les valeurs en dehors de `_Y` sont silencieusement ignorées à l'analyse (DL7 émet `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |

C'est le **seul** nouveau champ de frontmatter d'agent au-delà de la liste de #4821. Les champs qui ont été recherchés mais **NON** trouvés sur `Ig5` / `JL7` : `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (ceux-ci n'apparaissent que sur le schéma de compétence `bg5` ou dans des identifiants sans rapport).

### Chargeur — carte des fichiers et fonctions

| Préoccupation                                                | Fonction                                                                                                                                                     | Emplacement            | Conf  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| Assembleur de registre de premier niveau                     | `QL` (nom exporté `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| Parcours du système de fichiers (partagé avec skills/commandes/styles de sortie) | `Gm` (mémorisé via `h6`)                                                                                                                                     | strings:312887         | **C** |
| Découverte par fichier `.md`                                 | `d_q` (= `loadMarkdownFiles`, ripgrep avec `--files --hidden --follow --no-ignore --glob *.md`, 3 s `AbortSignal.timeout`, fallback `wY3` quand `__("true")`) | strings:312887         | **C** |
| Analyseur par fichier (Markdown)                             | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| Analyseur par fichier (JSON)                                 | `fL7` (= `parseAgentFromJson`), utilise le schéma `JL7`                                                                                                      | strings:309073         | **C** |
| Chargeur d'agent de plugin                                   | `b0_` → par répertoire `oR7` → par fichier `sR7`                                                                                                             | strings:308780, 308779 | **C** |
| Intégrés                                                     | `naH()` — émet `[JqH=general-purpose, KL7=statusline-setup, …]` plus implicite `YI=fork`                                                                     | strings:309073, 308663 | **C** |
| Résolveur d'écrasement                                       | `DS()` (= `getActiveAgentsFromList`) — voir Ordre de résolution                                                                                              | strings:309073         | **C** |
| Invalidation de cache                                        | `u0_()` (= `clearAgentDefinitionsCache`) — vide `QL.cache` + `Gm.cache`                                                                                      | strings:309073         | **C** |
| Watcher FS (chokidar)                                        | `s_T()` → `Q4_=s_T()` à l'initialisation du module (`WB6`)                                                                                                  | strings:316417         | **C** |

`Gm("agents", _)` lit trois `baseDirs` (`policySettings`, `userSettings`, `projectSettings`), chacun étiqueté sur l'enregistrement, puis dédoublonne par **inœud** (supprime les doublons de même inœud provenant de liens symboliques / physiques, journalise `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`). Télémétrie : `tengu_dir_search` avec `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Ordre de résolution — précédence définitive

La fonction `DS()` filtre son entrée par `source`, puis itère un tableau d'ordre fixe dans une `Map` indexée par `agentType`. Comme `Map.set` écrase, le **DERNIER seau touché gagne** :

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  plus haute précédence
```

| Source            | Origine                                                                                                                                                                          | Priorité d'écrasement | Conf                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------- |
| `built-in`        | `naH()` (codé en dur dans le binaire)                                                                                                                                            | 1 (la plus basse)     | **C** strings:309073              |
| `plugin`          | `b0_` → par plugin `agentsPath`/`agentsPaths`                                                                                                                                   | 2                     | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` ou `~/.claude`)                                                                                                                         | 3                     | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` PLUS `iV_()` remonte jusqu'au répertoire personnel / racine git                                                                                          | 4                     | **C** strings:312887, iV\_ inline |
| `flagSettings`    | Drapeau CLI `--agents <json>` (schéma `qKO = h.record(h.string(), JL7())`)                                                                                                       | 5                     | **C** strings:330190, 309076      |
| `policySettings`  | Répertoire géré par le système : macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (la plus haute)    | **C** strings:307649 (H2), 312887 |

Les collisions sont résolues **silencieusement** — seul l'événement de télémétrie `tengu_plugin_name_collision` se déclenche (`winner_source: T.at(-1)`) ; il n'y a aucun avertissement du type « X écrase l'intégré » affiché à l'utilisateur. (strings:308742 `hMH`.)

Comportement subtil : `iV_()` remonte **du plus intérieur vers l'extérieur** depuis le `cwd`, mais Map.set écrase en dernier, donc **`.claude/agents/` de l'arbre extérieur l'emporte sur l'arbre intérieur** dans `projectSettings`. C'est surprenant — à signaler dans les questions ouvertes.

### Analyseur de frontmatter

| Question                                                   | Réponse                                                                                                                                                                                                                                         | Conf                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Bibliothèque utilisée ?                                    | **Aucune** — séparateur fait maison `lz` appelant `Bun.YAML.parse` (via le wrapper `l5H`). Pas de `gray-matter`, `js-yaml` ni `front-matter` dans le binaire.                                                                                    | **C** strings:307902 (l5H), 307905 (lz), 110303 (erreurs Bun.YAML)|
| Regex                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| Gestion des échecs                                         | Échec de l'analyse YAML → nouvelle tentative avec normalisation tabulation vers 2 espaces ; si cela échoue encore, journalise `Failed to parse YAML frontmatter in <file>: <err>` en avertissement et retourne `{frontmatter: {}, content: body}` (NE JAMAIS lever d'exception) | **C** strings:307905, 151839 |
| Extraction du corps                                        | Découpage de chaîne simple `H.slice(K[0].length)` après le `---` de fermeture ; normalisé ensuite par `v$H` (probablement suppression du saut de ligne de début)                                                                                | **C** strings:307905                                              |
| Partagé entre agents / skills / commandes / styles de sortie ? | **Oui** — le même `lz` est réutilisé par `Iq_` (chargeur de compétences), `f13` (chargeur de commandes dépréciées) et le chargeur d'agent via `Gm` → `d_q`                                                                                      | **C** strings:312690                                              |
| Validateur de schéma                                        | **Zod v4** (intégré). Marqueurs propres à v4 : `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` présents                                                                                                                           | **C** strings:141270-141395, 141586                               |
| Mode de validation                                          | **Ombre** — `ahH("agent", frontmatter)` exécute `ug5.agent().strict().safeParse()` pour la télémétrie **uniquement** ; DL7 ignore le résultat et procède à sa propre validation champ par champ. L'objet frontmatter tolérant est la source de vérité à l'exécution. | **C** strings:308120 (ahH/ug5), 309074 (DL7 appelle mais ignore)|
| Événements de télémétrie                                    | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (dédoublonnés via un `Set A37` en processus)                                                                                                                         | **C** strings:154634, 154636                                      |
### Câblage — Outil Agent + indicateur CLI

| Couche                             | Rôle                                                                                                                                                                              | Conf                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Schéma de l'outil Tâche/Agent (`$_3`) | Déclare `subagent_type: string.optional()` ; si omis, revient à `general-purpose` (ou `fork` si `AI()` retourne vrai)                                                             | **C** strings:~309220        |
| Recherche de sous-agent            | `activeAgents.find(a => a.agentType === requestedType)` sur `toolUseContext.options.agentDefinitions.activeAgents`                                                                | **C** strings:~309220        |
| Repli flou                         | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")` ; correspondance ambiguë → `AgentTypeError` ; rematch net → `tengu_subagent_type_normalized` | **C** strings:~309220        |
| Barrière de permission             | `lV_(toolPermissionContext, "Task", agentType)` — refus → `Le type d'agent '<x>' a été refusé par la règle de permission 'Task(<x>)' de <source>.`                                | **C** strings:~309220        |
| Source du prompt système           | Le corps Markdown devient `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) quand la mémoire est activée)` — fermeture capturée au moment de l'analyse          | **C** strings:309074-6 (DL7) |
| Rendu thread principal             | `Pp({mainThreadAgentDefinition, …})` — si l'agent a `appendSystemPrompt: true` (le `claude` intégré par défaut), le corps est ajouté au défaut ; sinon **REMPLACE** le défaut      | **C** strings:311015         |
| CLI `--agent <nom>`                | Déclaré via Commander ; gestionnaire d'action `if(I) process.env.CLAUDE_CODE_AGENT = I;` — injecte dans une variable d'environnement, lue ailleurs dans `appState.agent`. Également enregistré dans le fichier pid. | **C** strings:330190, 142138 |
| CLI `--agents <json>`              | Indicateur séparé ; enregistrement JSON `{name: {description, prompt, …}}` validé par `qKO = h.record(h.string(), JL7())` ; rejoint le même registre `activeAgents` avec `source: flagSettings` | **C** strings:330190, 309076 |

### Cycle de vie — chargement à froid + rechargement à chaud

| Aspect                            | Comportement                                                                                                                                                                                                                   | Conf                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Chargement à froid                | Paresseux — `QL` est mémorisé via `h6` (wrapper de cache) ; le premier accès lit le système de fichiers + les plugins, les accès suivants renvoient le cache                                                                 | **C** strings:309076         |
| Mécanisme de rechargement à chaud | **Watcher chokidar** `s_T()` enregistré à l'initialisation du module (`WB6`) ; surveille `.claude/agents` (utilisateur + projet) ainsi que les répertoires skills et commandes                                                | **C** strings:316417         |
| Indicateurs du watcher            | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), événements `add`/`change`/`unlink` | **C** strings:316417         |
| Anti-rebond                       | 300 ms (`l_T = 300`) ; le gestionnaire appelle `RIH(), Vv(), u0_(), …` — `u0_()` invalide le cache des agents                                                                                                                 | **C** strings:316417, 309073 |
| Interrogation adaptative          | actif = intervalle `n_T = 2000 ms` ; inactif (aucune interaction pendant `r_T = 60000 ms`) → `i_T = 30000 ms` ; recrée l'instance chokidar lors du changement                                                                  | **C** strings:316417         |
| Commande slash `/agents`          | Interface `local-jsx` pour gérer les agents (Bibliothèque/créer/éditer/supprimer/exécuter) — **PAS** une commande de renumérisation                                                                                            | **C** strings:314593         |
| Commande slash `/reload-plugins`  | Réexécute `QL(W8())`, recompte les agents ; couvre les agents issus de plugins (que chokidar ne surveille PAS)                                                                                                                 | **C** strings:314595, 190948 |
| Autres chemins d'invalidation     | `clearSessionCaches` (utilisé par `/clear`) appelle également `u0_()`                                                                                                                                                          | **C** strings:313246         |

### Questions ouvertes (Phase 1)

| #   | Question                                                                                                                                      | Conf  | Chemin de résolution                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| Q1  | L'omission de `color` dans #4821 est-elle intentionnelle (c'est `@internal`) ou une négligence ?                                              | **O** | Traiter comme **intentionnelle** — porter le champ mais le marquer comme interne/uniquement UI |
| Q2  | Le comportement permissif de DL7 (background accepte des chaînes, maxTurns accepte des chaînes) est-il une fonctionnalité documentée ou un hack de rétrocompatibilité ? | **O** | Le refléter pour la parité, mais avertir dans la doc de portage                |
| Q3  | Pourquoi l'énumération `isolation` vaut `["worktree"]` seulement pour les agents alors que le schéma des paramètres de session d'arrière-plan accepte `["none","worktree"]` ? | **O** | Probablement "pas d'isolation" = champ omis ; documenter explicitement          |
| Q4  | `--agents <json>` (flagSettings) se place-t-il intentionnellement à la priorité 5 (au-dessus du projet, en-dessous de la politique) ?          | **O** | qwen-code peut ignorer l'indicateur dans v1, reporter la décision               |
| Q5  | Push du plus intérieur en premier par `iV_` + Map.set dernier gagnant → **l'arbre extérieur gagne** pour les collisions de projectSettings. Piège ou intentionnel ? | **O** | qwen-code devrait choisir la sémantique **le plus intérieur gagne** pour éviter le piège |

---

## Phase 2 — Plan d'implémentation pour qwen-code

### État actuel — carte en un paragraphe

qwen-code embarque déjà une infrastructure substantielle de sous-agents :
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implémente
les opérations CRUD sur des fichiers Markdown avec frontmatter YAML dans le répertoire
`.qwen/agents/` (projet) et `~/.qwen/agents/` (utilisateur), soutenu par un analyseur
YAML personnalisé (`packages/core/src/utils/yaml-parser.ts` — pas de dépendance
`gray-matter` / `yaml`, confirmé par `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) possède déjà `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` supporte déjà cinq
portées (session, projet, utilisateur, extension, intégré) avec une précédence
`session > projet > utilisateur > extension > intégré`
(`subagent-manager.ts:189-220`). L'outil Agent
(`packages/core/src/tools/agent/agent.ts`) déclare `subagent_type` et
rafraîchit dynamiquement son énumération de schéma via `subagentManager.changeListener`.
Un pont `convertClaudeAgentConfig()` existe déjà dans
`packages/core/src/extension/claude-converter.ts:162-220` avec un mappage de
noms d'outils et un mappage `permissionMode → approvalMode`. Le **manque** est :
(a) le schéma n'a pas 8 champs de #4821 (`effort`, `permissionMode` comme
citoyen de première classe, `mcpServers`, `hooks`, `maxTurns` comme niveau
supérieur, `skills`, `initialPrompt`, `memory`, `isolation`) ; (b) pas
d'indicateur CLI `--agent <nom>` ; (c) pas de rechargement à chaud de style
chokidar (l'invalidation de type extension existe, mais pas pour les agents du
système de fichiers) ; (d) `maxTurns` est actuellement imbriqué sous
`runConfig.max_turns` — doit être promu au niveau supérieur conformément à #2409.

### Décisions architecturales

#### D1. Réutiliser le yaml-parser existant pour le frontmatter

**Décision :** Réutiliser `packages/core/src/utils/yaml-parser.ts` (déjà utilisé par
`SubagentManager.parseSubagentContent` et le chargeur de skills).
**Justification :** Le `lz` de Claude Code est le même analyseur partagé utilisé pour les
skills + commandes + agents ; qwen-code reflète déjà ce modèle. Ajouter `gray-matter`
ou `js-yaml` est une complexité inutile. L'analyseur existant gère la séparation
`--- … ---` et reste silencieux en cas d'entrée malformée (correspond à la posture
`avertir-et-retourner-vide` de `lz`).

#### D2. Ordre de résolution / précédence

**Décision :** Utiliser `session > projet (.qwen/agents/) > utilisateur (~/.qwen/agents/)

> extension > intégré` — c'est-à-dire **conserver l'ordre existant de SubagentLevel
de qwen-code, NE PAS refléter les compartiments`flagSettings`/`policySettings` de
Claude Code dans v1**.
**Justification :** Les policySettings de Claude Code (répertoire géré) est une
histoire de déploiement d'entreprise que qwen-code n'a pas. Les agents injectés par
indicateur (`--agents <json>`) est une fonctionnalité pour utilisateurs avancés qui
peut atterrir en P4. La précédence existante à cinq niveaux de qwen-code couvre déjà
les cas que #4821 concerne : le projet remplace l'utilisateur qui remplace l'intégré.
Le niveau `extension` s'insère proprement entre l'utilisateur et l'intégré.

#### D3. Validation — conserver le SubagentValidator existant

**Décision :** Étendre `SubagentValidator`
(`packages/core/src/subagents/`) pour valider les huit nouveaux champs. **NE PAS**
introduire zod sauf si le pipeline de skillManager l'utilise déjà ; si le validateur
existant est fait maison, le conserver fait maison.
**Justification :** `Ig5` de Claude Code est uniquement dans l'ombre — la validation
à l'exécution est faite maison par `DL7`. Correspondre à ce modèle maintient les
messages d'erreur lisibles (par ex. `Le fichier agent <chemin> a un permissionMode
invalide '<x>'. Options valides : …`) sans ajouter une autre dépendance. Si skillManager
utilise déjà zod, suivre ce choix pour la cohérence — à déterminer en lisant le code
skill dans la préparation P1.

#### D4. Rechargement à chaud — reporter ; se fier au chargement à froid + rechargement explicite

**Décision :** v1 **N'EMBARQUE PAS** de watcher chokidar. Les crochets d'invalidation
de cache existent déjà (`subagentManager` a `changeListener` et un rafraîchissement
explicite piloté par CRUD). Le rechargement au niveau du projet a lieu au démarrage
de la session ; les modifications en session via l'interface `/agents` invalident.
Une commande slash `/reload-agents` (ou attachée à `/reload-plugins`) peut atterrir
en P4 si la demande utilisateur existe.
**Justification :** Le rechargement à chaud via un watcher FS est coûteux (chokidar
ajoute une boucle d'interrogation avec une planification adaptative — l'implémentation
de Claude Code à elle seule représente ~150 lignes de comptabilité). Le chargement
à froid au démarrage est largement suffisant pour v1 et correspond à la façon dont
`SubagentManager` est câblé aujourd'hui. Laisser la porte ouverte pour P4.

#### D5. Câbler l'indicateur CLI `--agent <nom>` — v1 dans le périmètre

**Décision :** Ajouter `--agent <nom>` à `packages/cli/src/config/config.ts`
CliArgs. Comportement : rechercher dans le registre résolu, définir l'agent comme
l'agent du thread principal, lever une erreur claire si le nom ne se résout pas.
Correspondre à la sémantique de Claude Code (remplacer le prompt système par défaut
sauf si l'agent a `appendSystemPrompt: true`). NE PAS utiliser une indirection via
la variable d'environnement `CLAUDE_CODE_AGENT` — l'objet `Config` de qwen-code
peut le porter directement.
**Justification :** C'est la poignée orientée utilisateur pour #4821 — sans elle, les
agents déclaratifs ne sont accessibles que via le paramètre `subagent_type` de l'outil
Agent, ce qui est trop indirect pour un cas d'usage "définir mon agent par défaut".
`--agents <json>` (pluriel) peut être reporté en P4.

#### D6. Coordination Workflow.agentType — contrat d'interface

**Décision :** Exposer une interface résolvante stable que le PR #4732
`createProductionDispatch` pourra appeler lorsqu'il atterrira. Spécifiquement :

| Contrat                                                                                                                                                                                                                                                                                                       | Propriétaire       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Le `name` du frontmatter EST la chaîne `agentType` du workflow (égalité de clé, sensible à la casse)                                                                                                                                                                                                          | ce PR              |
| Le plancher codé en dur de `disallowedTools` du workflow (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, reflété depuis l'amont `Tg8` ; vérifié dans PR #4732 comme `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) **UNION** avec `disallowedTools` au niveau agent — le plancher est toujours appliqué, même si la définition d'agent définit `tools` | PR workflow consomme |
| `opts.isolation` par appel remplace la valeur par défaut `isolation: 'worktree'` par agent                                                                                                                                                                                                                    | PR workflow consomme |
| `model`, `effort`, `permissionMode`, `maxTurns` de la définition d'agent remplacent les valeurs par défaut du workflow lorsqu'ils sont définis                                                                                                                                                              | PR workflow consomme |
| Le corps de l'agent devient le `systemPrompt` du sous-agent ; le `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` du workflow est le repli lorsque `agentType` ne se résout pas                                                                                                                                             | PR workflow consomme |
| Lorsque `agentType` n'est pas défini ou ne parvient pas à se résoudre, le workflow revient au sous-agent de workflow intégré (gracieusement, pas de levée d'erreur)                                                                                                                                            | PR workflow consomme |

**Résolution de la contradiction #4721 / #4821** (précédence `tools` vs
`disallowedTools`) : ce port écrit le registre d'agents de sorte que
`disallowedTools` soit **toujours porté séparément** de `tools`. La règle
"ignoré si tools est défini" du tableau de #4821 est **appliquée par les appels
à l'outil Agent** (c'est-à-dire lors de la construction du `ToolConfig` du
sous-agent), pas au moment de l'analyse. Cela permet au workflow de toujours
unir son plancher avec `disallowedTools` indépendamment du fait que l'agent
définisse `tools` ou non. Le registre d'agents est un **transporteur de données
passif** ; les règles de précédence vivent au site de répartition. Cela résout
le conflit apparent entre la règle "ignoré" de #4821 et la règle "union" de #4721.

**Canonicalisation des noms d'outils :** Utiliser `ToolNames.SEND_MESSAGE` et
`ToolNames.EXIT_PLAN_MODE` (vérifié par rapport au diff du PR #4732), exportés
comme constantes nommées depuis `packages/core/src/agents/runtime/workflow-orchestrator.ts`
une fois qu'il atterrit. Le port des agents déclaratifs lui-même n'a PAS besoin
d'importer ceux-ci — ils sont le plancher du workflow, appliqué au site de répartition.

### Disposition des modules

| Chemin                                                              | Nouveau / Touché | Rôle                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                              | **Touché**       | Ajouter 8 nouveaux champs à `SubagentConfig` : `effort`, `permissionMode` (se mappe déjà via `approvalMode` — garder les deux ? voir D7 ci-dessous), `mcpServers`, `hooks`, `maxTurns` (promu au niveau supérieur, déprécier `runConfig.max_turns`), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                   | **Touché**       | Étendre `parseSubagentContent` / `serializeSubagent` pour faire l'aller-retour des nouveaux champs ; étendre les appels à `SubagentValidator`                                                                                                                          |
| `packages/core/src/subagents/subagent-validator.ts` (chemin supposé) | **Touché**       | Ajouter une validation par champ correspondant aux messages d'erreur de DL7 : `Le fichier agent <chemin> a un permissionMode invalide '<x>'. Options valides : …` etc.                                                                                                 |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`           | **Nouveau**      | Source unique de vérité pour les constantes d'énumération : `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Mi­roir du texte exact de Claude Code 2.1.168.                                                              |
| `packages/core/src/subagents/builtin-agents.ts`                     | **Touché**       | Nouveaux champs par défaut à undefined ; pas de changement de comportement                                                                                                                                                                                             |
| `packages/core/src/tools/agent/agent.ts`                            | **Touché**       | Lire les nouveaux champs depuis `SubagentConfig` résolu lors de la construction des options du sous-agent (`model`, `maxTurns`, `permissionMode`, `effort`) ; câbler la sémantique de remplacement `isolation` par appel pour #4721                                    |
| `packages/cli/src/config/config.ts`                                 | **Touché**       | Ajouter l'indicateur `--agent <nom>` ; résoudre via `SubagentManager` au démarrage ; signaler une erreur si le nom ne se résout pas                                                                                                                                   |
| `packages/cli/src/config/config.test.ts`                            | **Touché**       | Tests pour la résolution de l'indicateur `--agent` + chemin d'erreur                                                                                                                                                                                                   |
| `packages/core/src/extension/claude-converter.ts`                   | **Touché**       | Ajouter le mappage pour les nouveaux champs lors de l'import de fichiers Claude `.md` (`mcpServers`, `hooks`, `maxTurns` au niveau supérieur, `memory`, `isolation`, etc.)                                                                                             |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`      | **Nouveau**      | Tests instantanés pour les listes d'énumération ; tests d'aller-retour d'analyse/sérialisation                                                                                                                                                                         |
| `packages/core/src/subagents/subagent-manager.test.ts`              | **Touché**       | Tests pour la validation des nouveaux champs, la précédence, les messages d'erreur                                                                                                                                                                                     |
| `packages/core/src/tools/agent/agent.test.ts`                       | **Touché**       | Tests pour le câblage des nouveaux champs dans le runtime des sous-agents                                                                                                                                                                                              |
| `docs/cli/agents.md` (si existe) ou `docs/declarative-agents.md`    | **Nouveau**      | Référence orientée utilisateur : schéma à 16 champs + exemples                                                                                                                                                                                                         |
### D7. `permissionMode` vs `approvalMode` — pont, ne remplacez pas

**Décision :** Accepter à la fois `permissionMode` (compatible Claude) et l’existant `approvalMode` (compatible qwen) dans le frontmatter. Lors du parsing, si `permissionMode` est défini, le mapper vers `approvalMode` en utilisant la table existante dans `claude-converter.ts:195-208` (`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`). Si les deux sont présents, `approvalMode` l’emporte (plus spécifique à qwen-code) et émet un événement de télémétrie de style `tengu_frontmatter_shadow_*` notant que les deux ont été définis.  
**Justification :** Préserve la rétrocompatibilité avec les fichiers `.qwen/agents/*.md` existants qui utilisent `approvalMode`, tout en acceptant `permissionMode` de Claude Code textuellement pour que les utilisateurs puissent déposer des fichiers d’agent Claude Code inchangés.

### Table de correspondance des schémas

| Champ Claude Code 2.1.168   | Champ qwen-code                              | Adaptation                                                                                                              | Notes                                                                                                                                    |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | `name`                                        | aucune                                                                                                                  | identique, obligatoire                                                                                                                   |
| `description`               | `description`                                 | aucune                                                                                                                  | identique, obligatoire                                                                                                                   |
| `model`                     | `model`                                       | accepter `inherit`, `fast`, `haiku`, `sonnet`, `opus` ou `authType:model-id`                                            | qwen-code prend déjà en charge le vocabulaire élargi ; `inherit` est nouveau                                                             |
| `tools`                     | `tools`                                       | accepter string\|array ; `*` → undefined (hérite de tout)                                                               | déjà pris en charge en tant que tableau ; ajouter la gestion string + `*`                                                                |
| `disallowedTools`           | `disallowedTools`                             | accepter string\|array ; **toujours porté séparément de `tools`**                                                       | règle de précédence (#4821 « ignoré si tools est défini ») appliquée par les **appelants**, pas par le parseur                          |
| `effort`                    | `effort` (nouveau)                            | enum `low/medium/high/xhigh/max` + entier ; alias `med → medium`                                                        | l’effet au moment de l’exécution est spécifique à qwen (mapper vers le bouton existing thinking-effort s’il existe, sinon stocker et ignorer) |
| `permissionMode`            | `permissionMode` (nouveau) + pont vers `approvalMode` | enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan` ; table de correspondance selon D7                        | accepter le format Claude textuellement                                                                                                  |
| `mcpServers`                | `mcpServers` (nouveau)                        | tableau de (string \| `{name: spec}`) ; valider par élément, supprimer les entrées erronées avec avertissement           | câblage dans le runtime MCP en P4                                                                                                        |
| `hooks`                     | `hooks` (nouveau)                             | objet correspondant à la forme des hooks de settings.json                                                                | câblage dans le runtime de hooks en P4                                                                                                    |
| `maxTurns`                  | `maxTurns` (nouveau, niveau supérieur)        | entier positif ; accepter une chaîne numérique pour la parité                                                             | **promu de `runConfig.max_turns`** ; conserver la forme imbriquée comme alias déprécié                                                   |
| `skills`                    | `skills` (nouveau)                            | tableau de noms de compétences ; chaîne séparée par des virgules également acceptée                                      | exécution : préchargement via skillManager au démarrage de l’agent                                                                       |
| `initialPrompt`             | `initialPrompt` (nouveau)                     | string ; uniquement des espaces → undefined ; ne se déclenche que lorsque l’agent est la session principale               | câblé via le chemin du flag `--agent`                                                                                                    |
| `memory`                    | `memory` (nouveau)                            | enum `user/project/local` ; charge depuis `.qwen/agent-memory/<name>/` etc.                                                | exécution en P4                                                                                                                          |
| `background`                | `background`                                  | accepter bool ou string `"true"/"false"` ; seulement truthy → true                                                       | déjà pris en charge ; assouplir les règles de parsing                                                                                    |
| `isolation`                 | `isolation` (nouveau)                         | enum **uniquement** `["worktree"]`                                                                                       | exécution détenue par le workflow PR (#4732 P3+) ; le registre ne fait que porter le champ                                             |
| `color` (non documenté #16) | `color`                                       | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]` ; les valeurs extérieures sont silencieusement ignorées | déjà présent dans `SubagentConfig` de qwen ; renforcer la validation pour correspondre à la liste autorisée de Claude Code            |

### Plan de test TDD

| Chunk                           | Fichier de test                             | Ce qu’il vérifie                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes enum du schéma       | `agent-frontmatter-schema.test.ts` (nouveau) | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` correspondent à Claude Code 2.1.168 octet par octet (instantané)                                                      |
| Parseur — chemin heureux        | `subagent-manager.test.ts`                  | Aller-retour de parsing de `.qwen/agents/test.md` avec les 16 champs → l’enregistrement émis a la forme attendue                                                                                                        |
| Parseur — champs obligatoires   | `subagent-manager.test.ts`                  | `name` manquant → null + log d’avertissement ; `description` manquant → null + log d’avertissement                                                                                                                    |
| Parseur — validation des enum   | `subagent-manager.test.ts`                  | `permissionMode` / `memory` / `isolation` / `effort` / `color` erronés émettent chacun un avertissement spécifique (correspondant au libellé DL7) et le champ est ignoré                                             |
| Parseur — types de champs souples | `subagent-manager.test.ts`                  | `background: "true"` → `true` ; `maxTurns: "5"` → `5` ; `effort: "med"` → `"medium"` ; `tools: "Read,Edit"` → `["Read","Edit"]` ; `tools: "*"` → undefined                                                            |
| Parseur — liste autorisée des couleurs | `subagent-manager.test.ts`                  | `color: "magenta"` est silencieusement ignoré (pas d’erreur), `color: "blue"` est conservé                                                                                                                             |
| Particularité du champ skills   | `subagent-manager.test.ts`                  | omettre `skills` donne `skills: []` (correspond au comportement d’émission DL7 de Claude Code)                                                                                                                       |
| Précédence de résolution        | `subagent-manager.test.ts`                  | Même `name` dans projet + utilisateur → projet gagne ; dans utilisateur + intégré → utilisateur gagne ; dans extension + intégré → extension gagne                                                                    |
| Déduplication par inode         | `subagent-manager.test.ts`                  | Deux chemins vers le même inode (lien symbolique) → un seul enregistrement, log émis                                                                                                                                    |
| Pont permissionMode             | `subagent-manager.test.ts`                  | `permissionMode: bypassPermissions` → `approvalMode: yolo` résolu ; les deux définis → `approvalMode` gagne + télémétrie                                                                                               |
| Flag CLI `--agent`              | `packages/cli/src/config/config.test.ts`    | Le flag définit l’agent du thread principal ; un nom non résolu lance une erreur avec « Agent type '<x>' not found. Available agents: … »                                                                                |
| Repli flou des outils d’agent   | `agent.test.ts`                             | `subagent_type: "Test_Engineer"` se résout en un `test-engineer` enregistré via normalisation NFKC-lowercase                                                                                                          |
| Erreur d’outil d’agent non trouvé | `agent.test.ts`                             | `subagent_type` non résolu → message d’erreur correspondant à « Agent type '<x>' not found. Available agents: <list> »                                                                                                |
| Contrat de workflow             | `agent-frontmatter-schema.test.ts`          | L’interface exportée `getAgentByName(name)` retourne le `SubagentConfig` complet incluant `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (consommable par le workflow PR #4732) |

### Plan de PR par phases

| Phase | Titre                                                                                                                             | Portée                                                                                                                                    | Bloque                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | Ajouter les champs à `SubagentConfig` ; étendre parseur + validateur + sérialiseur ; déprécier `runConfig.max_turns` ; ajouter le module de constantes enum ; tests | Aucun                          |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                       | Câbler `model`, `effort`, `maxTurns`, le pont `permissionMode`/`approvalMode` dans `AgentTool.execute()` → site d’appel `AgentHeadless.create()` ; tests          | P1                             |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                         | Ajouter `--agent <name>` à `CliArgs` ; résoudre au démarrage ; chemin d’erreur ; tests                                                                              | P1                             |
| **P4** | (optionnel, dérive de périmètre) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                    | Câbler les quatre champs « uniquement métadonnées en v1 » dans des effets réels d’exécution                                                                      | P1, plus sous-systèmes skill/MCP/hooks |

Chaque PR cible ≤ 800 LOC de delta (hors tests) ; P1 est le plus gros avec ~600 LOC de validateur + tests.

---

## Phase 3 — Matrice de coordination avec le port du workflow (#4721 / PR #4732)

| Fonctionnalité des agents déclaratifs                              | Interaction avec le workflow                                                                                                                                                                                          | Propriétaire                                                          | Bloqué par                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Champ `name` comme clé du registre                                 | Chaîne de recherche `opts.agentType` du workflow ([#4721][i4721] explicite)                                                                                                                                           | **Cette PR** définit le contrat du registre ; **PR workflow** consomme | aucun — la forme du registre peut se stabiliser d’abord |
| Champ `disallowedTools` sur l’agent                                | Le workflow fusionne avec le plancher codé en dur `[SEND_MESSAGE, EXIT_PLAN_MODE]` (selon [#4721][i4721] §2 — vérifié par rapport au diff PR #4732 : `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`)            | **Cette PR** porte le champ ; **PR workflow** fusionne lors du dispatch | PR workflow #4732 P3 atterrit                  |
| Champ `tools` sur l’agent                                          | Le workflow transmet textuellement à `ToolConfig.tools` du sous-agent                                                                                                                                                 | **Cette PR** porte le champ ; **PR workflow** câble                    | PR workflow #4732 P3                            |
| Champ `model` sur l’agent                                          | `opts.model` du workflow écrase par appel ; le `model` de l’agent est la valeur par défaut                                                                                                                            | **Cette PR** porte le champ ; **PR workflow** résout la précédence     | PR workflow #4732 P3                            |
| Champ `effort` sur l’agent                                         | L’écrasement du site d’appel du workflow gagne ; repli sur la valeur par défaut de l’agent                                                                                                                            | **Cette PR** porte le champ ; **PR workflow** résout                   | PR workflow #4732 P3                            |
| Champ `permissionMode` sur l’agent                                 | Mappé vers `approvalMode` du sous-agent au moment du dispatch ; l’écrasement du site d’appel du workflow gagne                                                                                                        | **Cette PR** porte le champ via le pont D7 ; **PR workflow** câble     | PR workflow #4732 P3                            |
| Champ `maxTurns` sur l’agent                                       | Remplace `WORKFLOW_SUBAGENT_MAX_TURNS = 50` codé en dur du workflow quand l’agent le définit                                                                                                                          | **Cette PR** porte le champ ; **PR workflow** résout la précédence     | PR workflow #4732 P3                            |
| Champ `isolation: 'worktree'` sur l’agent                          | Par défaut ; `opts.isolation` par appel écrase ([#4721][i4721] §3)                                                                                                                                                    | **Cette PR** porte le champ ; **PR workflow** possède l’exécution      | PR workflow #4732 P3+ (lève actuellement en P1) |
| Champ `initialPrompt` sur l’agent                                  | Le workflow **ne l’utilise pas** (ne se déclenche que lorsque l’agent est la session principale via `--agent`)                                                                                                        | **Cette PR** + **CLI**                                                 | aucun (indépendant)                             |
| `memory`, `mcpServers`, `hooks`, `skills`                          | Le workflow n’a pas de traitement spécial au-delà de la transmission au runtime du sous-agent                                                                                                                          | **Cette PR** porte les champs ; câblage exécution en P4 / futur        | PR futures                                      |
| Mises à jour `EXCLUDED_TOOLS_FOR_SUBAGENTS`                        | La PR workflow #4732 ajoute `WORKFLOW` à l’ensemble (d’après la découverte issue/PR-context — bien que la réfutation adversariale note que ce n’est PAS encore dans `agent-core.ts` sur `main`, seulement dans worktree) | **PR workflow** possède ; cette PR non touchée                         | aucun                                            |
| Forme canonique des noms d’outils pour le plancher du workflow (`ToolNames.SEND_MESSAGE`) | Cette PR n’importe pas les constantes du plancher ; elle ne porte que les chaînes `disallowedTools` telles qu’écrites. La PR workflow possède la canonicalisation.                                                     | **PR workflow**                                                        | PR workflow #4732                               |
| Ordre de livraison                                                  | Cette PR (P1+P2+P3) est livrée indépendamment du workflow. La PR workflow #4732 P3 est conditionnée par la possibilité d’importer le résolveur de type `getAgentByName()` de cette PR.                                  | Parallèle jusqu’à P3-du-workflow                                       | P3 du workflow lit les exports de cette PR      |

**Pas de blocage circulaire :** cette PR et la PR workflow peuvent atterrir en parallèle durant leurs phases P1/P2. Elles se synchronisent à la phase P3 du workflow, qui a besoin du résolveur de registre de cette PR. Si cette PR atterrit en premier, le P3 du workflow la lit. Si la PR workflow atterrit en premier, elle livre avec la recherche existante de `subagent_type` (retournant les valeurs par défaut du workflow en cas d’absence) et bascule vers le résolveur plus riche une fois cette PR atterrie.

---

## Phase 4 — Risques et questions ouvertes

### Risques

| #   | Risque                                                                                                                                                                                                  | Atténuation                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Dérive de schéma entre les versions mineures de Claude Code (2.1.168 → 2.1.x)                                                                                                                           | Épingler le module de constantes enum avec un commentaire « vérifié contre 2.1.168 » ; relancer le grep de chaînes contre les nouvelles versions dans le cadre de la compétence `feature-reverse` |
| R2  | `runConfig.max_turns` → `maxTurns` au niveau supérieur est un changement de schéma cassant pour les fichiers `.qwen/agents/*.md` existants                                                              | Conserver la forme imbriquée comme alias déprécié avec une dépréciation d’un cycle ; émettre un avertissement lors du parsing, documenter dans le CHANGELOG                                         |
| R3  | Le pont `permissionMode` ↔ `approvalMode` avec perte à l’aller-retour (Claude a 6 modes, qwen en a environ 4)                                                                                           | Mapper les deux directions explicitement selon D7 ; émettre de la télémétrie sur le double réglage ; NE PAS réécrire silencieusement lors de la sauvegarde                                           |
| R4  | Nouveaux champs (`hooks`, `mcpServers`, `skills`, `memory`) portés dans le registre mais sans exécution en v1 → les utilisateurs peuvent les définir et ne rien obtenir silencieusement                | Documenter clairement le périmètre v1 ; émettre un log info unique par agent lorsqu’un champ « porté mais pas encore en exécution » est non vide                                                    |
| R5  | La vérification adversariale a signalé que `EXCLUDED_TOOLS_FOR_SUBAGENTS` n’inclut PAS `WORKFLOW` sur `main` — cela pourrait signifier que le port du workflow n’est pas encore fusionné ou que le garde de fan-out récursif manque | Confirmer avec l’auteur de la PR workflow (LaZzyMan = moi) que le garde atterrit avec la PR #4732, pas dans ce port                                                           |
| R6  | Le comportement « l’arbre extérieur bat l’arbre intérieur » de projectSettings (Q5) est un piège s’il est reflété                                                                                     | qwen-code choisit explicitement **l’arbre le plus intérieur gagne** ; testé via le fixture R5                                                                                                        |
| R7  | Le champ `color` est documenté comme `@internal` dans le texte de description du binaire — nous portons peut-être quelque chose qu’Anthropic ne supporte explicitement pas                              | Le porter mais le marquer `@internal` dans la documentation qwen-code aussi ; le traiter comme uniquement UI ; ne pas le faire apparaître dans les docs de référence orientées utilisateur         |
### Questions ouvertes — résolutions proposées

| #   | Question                                                                                                                                                       | Résolution                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | L'absence de `color` dans #4821 est-elle intentionnelle ?                                                                                                      | **À traiter comme intentionnelle**. Porter le champ ; ne PAS le mentionner dans la doc utilisateur sauf en tant que « disponible, interne ».                                                                                                                                                                                                             |
| Q2  | Comportement laxiste de DL7 : documenté ou bidouille ?                                                                                                         | **Le reproduire à l'identique**. Accepter `background: "true"`, `maxTurns: "5"`, `effort: "med"` pour la parité, même si non documenté. Ajouter des tests.                                                                                                                                                                                              |
| Q3  | Pourquoi l’énumération d’isolation diffère-t-elle entre le schéma d’agent et le schéma de session d’arrière-plan ?                                              | **Documenter la divergence dans un commentaire de code** ; « pas d’isolation » = champ omis, pas une valeur d’énumération.                                                                                                                                                                                                                             |
| Q4  | `--agents <json>` (pluriel, flagSettings) doit-il atterrir dans la v1 ?                                                                                        | **Différer à P4**. Surface CLI pour utilisateurs avancés ; la v1 ne livre que `--agent <name>` (singulier), ce qui est ce qui importe pour #4821.                                                                                                                                                                                                        |
| Q5  | Arbre interne vs arbre externe : précédence pour les `.qwen/agents/` imbriqués ?                                                                               | **Le plus profond gagne**. Surcharger le comportement accidentel « l’extérieur gagne » de Claude Code. Utiliser un dispositif de test dans P1.                                                                                                                                                                                                           |
| Q6  | Précédence de `tools` vs `disallowedTools` : #4821 dit « ignoré si tools est défini » ; #4721 dit « union avec le plancher du workflow ».                       | **Le registre est une donnée stupide**. L’analyseur conserve les deux champs indépendamment. Les règles de précédence vivent sur le site de répartition (outil Agent / workflow). Résout la contradiction.                                                                                                                                               |
| Q7  | Forme canonique du nom d’outil pour le plancher `disallowedTools` du workflow — vérifiée par rapport à la PR #4732 comme `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE` | **N’est pas du ressort de cette PR** — appartient à la PR du workflow. Documenter uniquement dans la matrice de coordination.                                                                                                                                                                                                                         |
| Q8  | La résolution de fermeture #2409 affecte-t-elle quelque chose ?                                                                                                | **Hériter de la directive de #2409 « promouvoir model + maxTurns au niveau supérieur »**. Déjà intégré à ce plan.                                                                                                                                                                                                                                      |
| Q9  | La priorité des agents de niveau `extension` dans `SubagentLevel` existant de qwen-code doit-elle rester au-dessus de `builtin` (actuel) ou en dessous (Claude Code n’a pas d’équivalent) ? | **Conserver `extension > builtin`**. Les extensions sont installées par l’utilisateur ; les intégrées sont les valeurs par défaut du fournisseur. L’utilisateur l’emporte.                                                                                                                                                                               |
| Q10 | Les tickets #4821, #4721, #4732 sont-ils entièrement spécifiés pour le contrat que ce document propose ?                                                        | **Poster un commentaire de coordination sur #4821** liant ce document, résumant les décisions champ par champ, et demandant aux mainteneurs d’accuser réception de : (a) la parité de schéma avec les 16 champs de Claude Code 2.1.168, (b) le pont D7 `permissionMode`/`approvalMode`, (c) l’ordre de priorité D2, (d) la résolution registre-donnée-stupide de la contradiction `tools`/`disallowedTools`. |

### Éléments d'action de coordination

| #   | Action                                                                       | Où                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Poster le récapitulatif champ par champ + 5 décisions sur #4821 pour accord des mainteneurs        | commentaire sur #4821                                     |
| A2  | Mettre un lien croisé vers ce document depuis #4721 en signalant la matrice de phase 3                         | commentaire sur #4721                                     |
| A3  | Une fois la P1 de ce port livrée, signaler à #4732 de basculer vers un résolveur plus riche          | commentaire sur PR #4732 (quand prêt)                     |
| A4  | Relancer le grep de chaînes contre la prochaine version mineure de Claude Code pour détection de dérive de schéma | tâche cron de la compétence `feature-reverse` (manuelle jusque-là) |
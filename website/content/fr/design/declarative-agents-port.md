# Définitions d'agents déclaratifs — Portage depuis Claude Code 2.1.168

Document de conception interne pour le portage du schéma d'agent déclaratif (markdown +
frontmatter YAML) de Claude Code vers qwen-code, traitant l'issue [#4821][i4821] et
coordonnant avec le portage du workflow dans l'issue [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## État d'implémentation (tranches verticales)

La PR [#4842][p4842] a livré les champs avec un chemin d'exécution de bout en bout à l'époque. La PR [#4870][p4870] a ensuite remplacé le parseur YAML pour prendre en charge les scalaires de bloc. Cette PR de suivi s'appuie sur les deux : elle remplace le **stringifier** YAML (la PR #4870 l'avait laissé implémenté à la main — voir
`docs/design/yaml-parser-replacement.md`), expose `mcpServers` + `hooks` sur
`SubagentConfig`, et les connecte au runtime pour que les serveurs MCP et les hooks par agent se déclenchent réellement lorsqu'un sous-agent s'exécute.

| Champ             | Statut                  | Notes                                                                                                                                                               |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **livré (#4842)**       | fait le pont avec le `approvalMode` existant de qwen au moment du parsing                                                                                           |
| `maxTurns`        | **livré (#4842)**       | connecté au chemin d'exécution `runConfig.max_turns` existant                                                                                                       |
| `color` allowlist | **livré (#4842)**       | restreint le champ existant à l'ensemble `_Y` de CC + gestion du marqueur legacy `auto`                                                                             |
| `mcpServers`      | **livré (suivi)**       | round-trip YAML imbriqué fiable via eemeli/`yaml` stringify ; le runtime override fusionne les serveurs de session + agent via le wrapper Config du sous-agent + reconstruction forcée du registre d'outils |
| `hooks`           | **livré (suivi)**       | entrées éphémères de HookRegistry enregistrées au spawn du sous-agent, supprimées via `onStop` ; la v1 se déclenche globalement (pas de filtre par portée d'agent)  |
| `effort`          | différé                 | aucun paramètre `effort` au niveau du modèle n'existe encore dans les providers qwen                                                                                |
| `memory`          | différé                 | l'auto-memory de qwen n'a pas encore de distinction de portée `user`/`project`/`local`                                                                              |
| `isolation`       | différé                 | la PR workflow #4732 possède le runtime ; la valeur par défaut par agent arrivera quand celle-ci sera livrée                                                        |
| `initialPrompt`   | différé                 | nécessite le flag CLI `--agent` (pas d'infrastructure main-session-agent dans qwen)                                                                                 |
| `skills`          | différé                 | nécessite la consommation de `config.skills` par SkillManager                                                                                                       |

Le dossier complet de rétro-ingénierie ci-dessous est conservé comme référence de conception
pour les champs différés — les constantes de schéma, la sémantique DL7/Ig5, les messages d'erreur
et la matrice de coordination avec le workflow sont toujours essentiels pour ce travail.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Phase 0 — Périmètre

| Élément                  | Valeur                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Dernière version upstream vérifiée | Claude Code **2.1.168** (l'issue #4821 référence ≥ 2.1.167, nous sommes une version au-dessus)                                |
| Binaire natif            | `/private/tmp/cc-2.1.168/package/claude` (220 Mo)                                                                                       |
| Extraction des strings   | `/private/tmp/cc-2.1.168/claude.strings` (~342 k lignes)                                                                                |
| Worktree                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| Branche                  | `lazzy/gifted-hamilton-684741` basée sur `main @ 45efb1d3a`                                                                             |
| Hors périmètre           | Code du workflow de la PR #4732 (worktree séparé `lazzy/lucid-pare-974192`) — coordination via l'interface uniquement                   |
| Règle d'auteur           | L'auteur est **LaZzyMan** ; **aucun** trailer `Co-Authored-By` ou d'outillage IA dans les commits, PRs, issues ou commentaires (selon `~/.claude/CLAUDE.md`) |

---

## Phase 1 — Résultats de la rétro-ingénierie

Toutes les affirmations ici ont été vérifiées de manière indépendante via grep sur `claude.strings` et
ont survécu à des tests de réfutation adverses. Niveaux de confiance : **C** = Confirmé (preuve binaire directe),
**I** = Inféré (synthétisé à partir de plusieurs faits confirmés),
**O** = Ouvert (encore incertain).

### Schéma — les 15 champs, réfutés et reconfirmés

Le shadow schema du frontmatter de l'agent est `Ig5`, utilisé à l'intérieur de `ug5.agent` pour
la télémétrie `tengu_frontmatter_shadow_unknown_key` / `_mismatch`. Le
**chargeur de production est `DL7`** (`parseAgentFromMarkdown`), qui effectue
une validation champ par champ implémentée à la main avec des messages d'erreur personnalisés. Un
**schéma JSON-form `JL7`** séparé (utilisé par `fL7` / `parseAgentFromJson`) est plus strict,
mais constitue un chemin de code différent (utilisé par `--agents <json>` et
`settings.agents`).

| #   | Champ             | Type (Ig5 / DL7)                        | Requis | Défaut       | Enum / Contrainte                                                                                                                       | Conf                                        |
| --- | ----------------- | --------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | string, non-empty                       | **oui**  | —            | none — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                  | **C** strings:308120, 309074                |
| 2   | `description`     | string, non-empty                       | **oui**  | —            | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | string                                  | non      | undefined    | `inherit` (insensible à la casse) normalisé en littéral `"inherit"` ; sinon passé tel quel après rognage                                | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | string\|array (MDH union)               | non      | undefined    | token unique `*` → `undefined` (signifie "hériter de tout") ; dupliqué via `AXH`/`FbK`                                                  | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | string\|array (MDH)                     | non      | undefined    | "Ignoré si `tools` est défini" (selon le texte describe) ; appliqué par les appelants                                                   | **C** strings:308120, 309075                |
| 6   | `effort`          | string\|integer                         | non      | undefined    | enum `GN=["low","medium","high","xhigh","max"]` OU `int` ; alias `P37={med:"medium"}`                                                   | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | string                                  | non      | undefined    | enum `$E = Gmq = [...kc]` où `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 valeurs)                     | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | non     | undefined    | chaque élément : string OU `record(string, MCPServerSpec)` ; `safeParse` par élément dans DL7                                           | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | non      | undefined    | validé paresseusement au runtime via `TKO` → `_u().safeParse` (forme des hooks de settings.json)                                        | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | non      | undefined    | entier positif (parsé par `W46` — accepte les numériques ou les chaînes numériques)                                                     | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | string\|array (MDH)                     | non      | `[]` (émis)  | normalisé via `ml(q.skills) = FbK(H) ?? []` ; pas de wildcard `*` (contrairement à `tools`)                                             | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | string                                  | non      | undefined    | uniquement des espaces → undefined ; auto-soumis uniquement lorsque l'agent est la **session principale** (via `--agent` / settings), ignoré en tant que sous-agent | **C** strings:308120, 309075                |
| 13  | `memory`          | string                                  | non      | undefined    | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | string\|bool (eiH=EL8)                  | non      | undefined    | accepte `true` / `false` / `"true"` / `"false"` ; seules les valeurs truthy sont normalisées à `true`, sinon `undefined`                | **C** strings:308120, 309075                |
| 15  | `isolation`       | string                                  | non      | undefined    | enum **uniquement** `["worktree"]` (PAS `["none","worktree"]` — il s'agit d'un schéma différent à strings:313284 pour les paramètres de session en arrière-plan) | **C** strings:308120, 309075, 309076        |

Observation subtile qui a survécu à la réfutation : bien que `skills` soit "optionnel",
la clause d'émission de DL7 est `...I !== void 0 && {skills: I}` et `ml(undefined)`
retourne `[]` (non-undefined), donc **l'enregistrement final émis contiendra
`skills: []` même si le frontmatter omet le champ**. Cela affecte les vérifications d'égalité
en aval — à signaler pour le portage de qwen-code.

### Champs supplémentaires possibles au-delà des 15

| #   | Champ       | Type   | Défaut    | Enum / Contrainte                                                                                                                                                                                                                                                            | Conf                                     |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | string | undefined | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]` ; décrit comme `"@internal — display color in the agents UI"` ; les valeurs en dehors de `_Y` sont silencieusement ignorées au moment du parsing (DL7 émet `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |
Il s'agit du **seul** nouveau champ frontmatter d'agent en dehors de la liste de #4821. Champs recherchés mais **NON** trouvés sur `Ig5` / `JL7` : `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (tous ces champs n'apparaissent que dans le schéma de skill `bg5` ou des identifiants non liés).

### Loader — carte des fichiers et des fonctions

| Sujet                                                       | Fonction                                                                                                                                                     | Emplacement            | Conf  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| Assembleur de registre de haut niveau                       | `QL` (nom d'export `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| Parcours du système de fichiers (partagé avec les skills/commands/output-styles) | `Gm` (mémorisé via `h6`)                                                                                                                                     | strings:312887         | **C** |
| Découverte par fichier `.md`                                | `d_q` (= `loadMarkdownFiles`, ripgrep avec `--files --hidden --follow --no-ignore --glob *.md`, 3 s `AbortSignal.timeout`, fallback `wY3` lorsque `__("true")`) | strings:312887         | **C** |
| Analyseur par fichier (markdown)                            | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| Analyseur par fichier (JSON)                                | `fL7` (= `parseAgentFromJson`), utilise le schéma `JL7`                                                                                                            | strings:309073         | **C** |
| Chargeur d'agents de plugin                                 | `b0_` → par répertoire `oR7` → par fichier `sR7`                                                                                                                       | strings:308780, 308779 | **C** |
| Intégrés (Built-ins)                                        | `naH()` — émet `[JqH=general-purpose, KL7=statusline-setup, …]` plus `YI=fork` implicite                                                                     | strings:309073, 308663 | **C** |
| Résolveur d'overrides                                       | `DS()` (= `getActiveAgentsFromList`) — voir Resolution Order                                                                                                  | strings:309073         | **C** |
| Invalidation du cache                                       | `u0_()` (= `clearAgentDefinitionsCache`) — vide `QL.cache` + `Gm.cache`                                                                                    | strings:309073         | **C** |
| Observateur FS (chokidar)                                   | `s_T()` → `Q4_=s_T()` à l'init du module (`WB6`)                                                                                                                 | strings:316417         | **C** |

`Gm("agents", _)` lit trois `baseDirs` (`policySettings`, `userSettings`, `projectSettings`), chacun étant tagué sur l'enregistrement, puis déduplique par **inode** (supprime les doublons de même inode provenant de liens symboliques / liens physiques, log `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`).
Télémétrie : `tengu_dir_search` avec `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Ordre de résolution — priorité définitive

La fonction `DS()` filtre son entrée par `source`, puis itère un tableau d'ordre fixe dans une `Map` indexée par `agentType`. Comme `Map.set` écrase les valeurs, le **DERNIER bucket touché gagne** :

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  highest precedence
```

| Source            | Origine                                                                                                                                                                            | Priorité d'override | Conf                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `built-in`        | `naH()` (codé en dur dans le binaire)                                                                                                                                                     | 1 (la plus basse)        | **C** strings:309073              |
| `plugin`          | `b0_` → `agentsPath`/`agentsPaths` par plugin                                                                                                                                     | 2                 | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` ou `~/.claude`)                                                                                                                          | 3                 | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` PLUS parcours `iV_()` jusqu'au homedir / git root                                                                                                                | 4                 | **C** strings:312887, iV\_ inline |
| `flagSettings`    | flag CLI `--agents <json>` (schéma `qKO = h.record(h.string(), JL7())`)                                                                                                           | 5                 | **C** strings:330190, 309076      |
| `policySettings`  | répertoire géré par le système : macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (la plus haute)       | **C** strings:307649 (H2), 312887 |

Les collisions sont résolues **silencieusement** — seul l'événement de télémétrie `tengu_plugin_name_collision` se déclenche (`winner_source: T.at(-1)`) ; aucun avertissement "X overrides built-in" n'est affiché à l'utilisateur. (strings:308742 `hMH`.)

Comportement subtil : `iV_()` parcourt de l'**intérieur vers l'extérieur** depuis `cwd`, mais comme `Map.set` applique la règle du dernier gagnant, **l'arborescence externe `.claude/agents/` l'emporte sur l'arborescence interne** au sein de `projectSettings`. C'est surprenant — à ajouter aux questions en suspens.

### Analyseur de frontmatter

| Question                                                   | Réponse                                                                                                                                                                                                                                         | Conf                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Bibliothèque utilisée ?                                              | **Aucune** — splitter fait maison `lz` appelant `Bun.YAML.parse` (via le wrapper `l5H`). Pas de `gray-matter`, `js-yaml`, ni `front-matter` dans le binaire.                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (erreurs Bun.YAML) |
| Regex                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| Gestion des erreurs                                           | Échec du parsing YAML → nouvelle tentative avec normalisation des tabulations en 2 espaces ; si cela échoue encore, log `Failed to parse YAML frontmatter in <file>: <err>` en warn et retourne `{frontmatter: {}, content: body}` (ne lance JAMAIS d'exception)                                     | **C** strings:307905, 151839                                      |
| Extraction du corps                                            | Découpe de chaîne simple `H.slice(K[0].length)` après le `---` de fermeture ; normalisé ensuite par `v$H` (probablement suppression du saut de ligne initial)                                                                                                                        | **C** strings:307905                                              |
| Partagé entre agents / skills / commands / output-styles ? | **Oui** — le même `lz` est réutilisé par `Iq_` (chargeur de skills), `f13` (chargeur de commands obsolète) et le chargeur d'agents via `Gm` → `d_q`                                                                                                                  | **C** strings:312690                                              |
| Validateur de schéma                                           | **Zod v4** (bundled). Marqueurs spécifiques à la v4 `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` présents                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| Mode de validation                                            | **Shadow** — `ahH("agent", frontmatter)` exécute `ug5.agent().strict().safeParse()` pour la télémétrie **uniquement** ; DL7 ignore le résultat et procède à sa propre validation champ par champ. L'objet frontmatter permissif est la source de vérité au runtime. | **C** strings:308120 (ahH/ug5), 309074 (DL7 appelle mais ignore)    |
| Événements de télémétrie                                           | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (dédupliqués via le `Set A37` en mémoire)                                                                                                                                 | **C** strings:154634, 154636                                      |

### Câblage — Outil Agent + flag CLI

| Couche                          | Fonction                                                                                                                                                                       | Conf                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Schéma de l'outil Task/Agent (`$_3`) | Déclare `subagent_type: string.optional()` ; si omis, retombe sur `general-purpose` (ou `fork` si `AI()` renvoie true)                                                      | **C** strings:~309220        |
| Recherche de sous-agent                | `activeAgents.find(a => a.agentType === requestedType)` sur `toolUseContext.options.agentDefinitions.activeAgents`                                                             | **C** strings:~309220        |
| Fallback approximatif (Fuzzy)                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")` ; correspondance ambiguë → `AgentTypeError` ; nouvelle correspondance exacte → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| Porte de permission                | `lV_(toolPermissionContext, "Task", agentType)` — refus → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| Source du system-prompt           | Le corps Markdown devient `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — closure capturée au moment du parsing                                  | **C** strings:309074-6 (DL7) |
| Rendu du thread principal             | `Pp({mainThreadAgentDefinition, …})` — si l'agent a `appendSystemPrompt: true` (le built-in fourre-tout `claude`), le corps est ajouté à celui par défaut ; sinon il **REMPLACE** celui par défaut      | **C** strings:311015         |
| CLI `--agent <name>`           | Déclaré via Commander ; gestionnaire d'action `if(I) process.env.CLAUDE_CODE_AGENT = I;` — injecte dans la variable d'env, lu ailleurs dans `appState.agent`. Également enregistré dans le fichier pid.          | **C** strings:330190, 142138 |
| CLI `--agents <json>`          | Flag séparé ; enregistrement JSON `{name: {description, prompt, …}}` validé par `qKO = h.record(h.string(), JL7())` ; rejoint le même registre `activeAgents` avec `source: flagSettings` | **C** strings:330190, 309076 |
### Cycle de vie — chargement à froid + rechargement à chaud

| Aspect                          | Comportement                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Chargement à froid                       | Paresseux (Lazy) — `QL` est mémorisé via `h6` (wrapper de cache) ; le premier accès lit le système de fichiers + les plugins, les accès suivants retournent le cache                                                                                               | **C** strings:309076         |
| Mécanisme de rechargement à chaud            | **watcher chokidar** `s_T()` enregistré à l'init du module (`WB6`) ; surveille `.claude/agents` (utilisateur + projet) ainsi que les répertoires skills + commands                                                                                      | **C** strings:316417         |
| Flags du watcher                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (true pour macOS), événements `add`/`change`/`unlink` | **C** strings:316417         |
| Debounce                        | 300 ms (`l_T = 300`) ; le handler appelle `RIH()`, `Vv()`, `u0_()`, … — `u0_()` invalide le cache des agents                                                                                                                              | **C** strings:316417, 309073 |
| Polling adaptatif                | actif = intervalle `n_T = 2000 ms` ; inactif (pas d'interaction pendant `r_T = 60000 ms`) → `i_T = 30000 ms` ; recrée l'instance chokidar lors du basculement                                                                                   | **C** strings:316417         |
| Commande slash `/agents`         | UI `local-jsx` pour gérer les agents (Library/create/edit/delete/run) — **N'**est **PAS** une commande de rescan                                                                                                                             | **C** strings:314593         |
| Commande slash `/reload-plugins` | Réexécute `QL(W8())`, recompte les agents ; couvre les agents provenant de plugins (que chokidar ne surveille **PAS**)                                                                                                                         | **C** strings:314595, 190948 |
| Autres chemins d'invalidation        | `clearSessionCaches` (utilisé par `/clear`) appelle également `u0_()`                                                                                                                                                                 | **C** strings:313246         |

### Questions ouvertes (Phase 1)

| #   | Question                                                                                                                                  | Conf  | Chemin de résolution                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | L'omission de `color` dans #4821 est-elle intentionnelle (c'est `@internal`) ou un oubli ?                                                            | **O** | Considérer comme **intentionnel** — porter le champ mais le marquer comme internal/UI-only  |
| Q2  | Le comportement permissif de `DL7` (background accepte des strings, maxTurns accepte des strings) est-il une fonctionnalité documentée pour l'utilisateur ou un hack de rétrocompatibilité ? | **O** | Le reproduire pour assurer la parité, mais avertir dans la documentation du port                             |
| Q3  | Pourquoi l'enum `isolation` `["worktree"]` s'applique-t-elle uniquement aux agents alors que le schéma de configuration de background-session accepte `["none","worktree"]` ?        | **O** | Probablement "no isolation" = champ omis ; documenter explicitement              |
| Q4  | Le flag `--agents <json>` (`flagSettings`) se situe-t-il intentionnellement à la précédence 5 (au-dessus de project, en dessous de policy) ?                                    | **O** | qwen-code peut ignorer ce flag dans la v1 et reporter la décision                   |
| Q5  | Push innermost-first par `iV_` + Map.set last-wins → **outer-tree wins** pour les collisions de `projectSettings`. Piège (footgun) ou intentionnel ?           | **O** | qwen-code devrait adopter la sémantique **innermost-wins** pour éviter ce piège |

---

## Phase 2 — Plan d'implémentation pour qwen-code

### État actuel — vue d'ensemble en un paragraphe

qwen-code dispose déjà d'une infrastructure de subagents substantielle :
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implémente
les opérations CRUD sur les fichiers markdown+YAML frontmatter dans `.qwen/agents/` (projet) et
`~/.qwen/agents/` (utilisateur), soutenu par un parseur YAML personnalisé
(`packages/core/src/utils/yaml-parser.ts` — pas de dépendance `gray-matter` / `yaml`,
confirmé par `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) possède déjà `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` prend déjà en charge
cinq scopes (session, project, user, extension, builtin) avec la précédence
`session > project > user > extension > builtin`
(`subagent-manager.ts:189-220`). L'outil Agent
(`packages/core/src/tools/agent/agent.ts`) déclare `subagent_type` et
rafraîchit dynamiquement son enum de schéma via `subagentManager.changeListener`.
Un pont `convertClaudeAgentConfig()` existe déjà dans
`packages/core/src/extension/claude-converter.ts:162-220` avec un mapping
de noms d'outils et un mapping `permissionMode → approvalMode`. Le **manque** est : (a) le
schéma omet 8 champs de #4821 (`effort`, `permissionMode` en tant que champ de premier ordre, `mcpServers`, `hooks`, `maxTurns` au niveau supérieur,
`skills`, `initialPrompt`, `memory`, `isolation`) ; (b) pas de flag CLI `--agent <name>` ; (c) pas de rechargement à chaud de type chokidar (l'invalidation de type extension existe, mais pas pour les agents du système de fichiers) ; (d) `maxTurns` est actuellement imbriqué sous `runConfig.max_turns` — il doit être promu au niveau supérieur conformément à #2409.

### Décisions architecturales

#### D1. Réutiliser le yaml-parser existant pour le frontmatter

**Décision :** Réutiliser `packages/core/src/utils/yaml-parser.ts` (déjà utilisé par
`SubagentManager.parseSubagentContent` et le chargeur de skills).
**Justification :** Le `lz` de Claude Code est le même parseur partagé utilisé pour les skills +
commands + agents ; qwen-code reproduit déjà ce modèle. Ajouter `gray-matter`
ou `js-yaml` représente une complexité inutile. Le parseur existant gère la division `--- … ---`
et reste silencieux en cas d'entrée malformée (ce qui correspond à l'approche
`warn-and-return-empty` de `lz`).

#### D2. Ordre de résolution / précédence

**Décision :** Utiliser `session > project (.qwen/agents/) > user (~/.qwen/agents/)
> extension > builtin` — c'est-à-dire **conserver l'ordre existant de qwen-code SubagentLevel, et ne PAS reproduire les buckets `flagSettings`/`policySettings` de Claude Code dans la v1**.
**Justification :** Les `policySettings` de Claude Code (répertoire géré) relèvent d'un déploiement entreprise que qwen-code n'a pas. Les agents injectés par flag (`--agents <json>`)
sont une fonctionnalité pour utilisateurs avancés qui peut arriver en P4. La précédence à cinq niveaux existante de qwen-code
couvre déjà les cas qui importent pour #4821 : project override user override built-in. Le niveau `extension` s'insère proprement entre user et
> builtin.

#### D3. Validation — conserver le SubagentValidator existant

**Décision :** Étendre `SubagentValidator`
(`packages/core/src/subagents/`) pour valider les huit nouveaux champs. **Ne PAS**
introduire zod à moins que le pipeline de skillManager ne l'utilise déjà ; si le
validateur existant est fait maison (hand-rolled), gardez-le fait maison.
**Justification :** Le `Ig5` de Claude Code est uniquement pour l'ombre (shadow-only) — la validation à l'exécution est
le `DL7` fait maison. Reproduire ce modèle garde les messages d'erreur lisibles
(par ex. `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`)
sans ajouter une autre dépendance. Si skillManager utilise déjà zod, suivez ce
choix par cohérence — à déterminer (TBD) en lisant le code des skills lors de la préparation de la P1.

#### D4. Rechargement à chaud — reporter ; s'appuyer sur le chargement à froid + rechargement explicite

**Décision :** La v1 ne livre **PAS** de watcher chokidar. Les hooks d'invalidation de cache
existent déjà (`subagentManager` a `changeListener` et un rafraîchissement explicite piloté par CRUD). Le rechargement au niveau projet se produit au démarrage de la session ; les modifications en session via l'UI `/agents` invalident. Une commande slash `/reload-agents` (ou en chevauchant `/reload-plugins`) peut arriver en P4 si la demande des utilisateurs existe.
**Justification :** Le rechargement à chaud via un watcher FS est coûteux (chokidar ajoute une boucle de polling
avec une planification adaptative — l'implémentation de Claude Code à elle seule comprend ~150
lignes de bookkeeping). Le chargement à froid au démarrage est amplement suffisant pour la v1 et correspond à la façon dont
`SubagentManager` est câblé aujourd'hui. Cela ouvre la porte pour la P4.

#### D5. Câbler le flag CLI `--agent <name>` — v1 dans le périmètre

**Décision :** Ajouter `--agent <name>` à `packages/cli/src/config/config.ts`
CliArgs. Comportement : recherche dans le registre résolu, définit l'agent comme
l'agent du thread principal, lève une erreur claire si le nom ne se résout pas. Reproduit la sémantique de Claude Code (remplace le system prompt par défaut sauf si l'agent a
`appendSystemPrompt: true`). N'utilise **PAS** d'indirection via la variable d'env `CLAUDE_CODE_AGENT` — l'objet `Config` de qwen-code peut le porter directement.
**Justification :** C'est le point d'entrée utilisateur pour #4821 — sans cela, les agents déclaratifs
ne sont accessibles que via le paramètre `subagent_type` de l'outil Agent, ce qui
est trop indirect pour un cas d'usage "définir mon agent par défaut". `--agents <json>`
(au pluriel) peut être reporté à la P4.

#### D6. Coordination de Workflow.agentType — contrat d'interface

**Décision :** Exposer une interface de résolution stable que le `createProductionDispatch` de la PR #4732
pourra appeler lorsqu'elle arrivera. Plus précisément :

| Contrat                                                                                                                                                                                                                                                                                                     | Propriétaire                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Le `name` du frontmatter EST la chaîne `agentType` du workflow (égalité de clé, sensible à la casse)                                                                                                                                                                                                                         | cette PR              |
| Le plancher hardcodé `disallowedTools` du workflow (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, reproduit depuis l'upstream `Tg8` ; vérifié dans la PR #4732 en tant que `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) fait l'**UNION** avec les `disallowedTools` au niveau agent — le plancher est toujours appliqué, même lorsque la définition de l'agent définit `tools` | la PR workflow consomme |
| Le `opts.isolation` par appel override le `isolation: 'worktree'` par défaut au niveau agent                                                                                                                                                                                                                                | la PR workflow consomme |
| `model`, `effort`, `permissionMode`, `maxTurns` de la définition de l'agent override les valeurs par défaut du workflow lorsqu'ils sont définis                                                                                                                                                                                                    | la PR workflow consomme |
| Le corps de l'Agent devient le `systemPrompt` du subagent ; le `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` du workflow est le fallback lorsque `agentType` ne se résout pas                                                                                                                                                             | la PR workflow consomme |
| Lorsque `agentType` n'est pas défini ou échoue à se résoudre, le workflow retombe sur le subagent de workflow intégré (graceful, pas de throw)                                                                                                                                                                                        | la PR workflow consomme |
**Résolution de la contradiction #4721 / #4821** (priorité entre `tools` et `disallowedTools`) : ce port configure le registre des agents de sorte que `disallowedTools` est **toujours transporté séparément** de `tools`. La règle « ignoré si tools est défini » du tableau de #4821 est **appliquée par les appelants de l'Agent-tool** (c'est-à-dire lors de la construction du `ToolConfig` du sous-agent), et non au moment du parsing. Cela permet au workflow de toujours faire l'union de son plancher avec `disallowedTools`, indépendamment du fait que l'agent définisse `tools` ou non. Le registre des agents est un **simple transporteur de données** ; les règles de priorité résident au niveau du point de dispatch. Cela résout le conflit apparent entre la règle « ignoré » de #4821 et la règle « union » de #4721.

**Canonicalisation des noms d'outils :** Utiliser `ToolNames.SEND_MESSAGE` et `ToolNames.EXIT_PLAN_MODE` (vérifiés par rapport au diff de la PR #4732), exportés en tant que constantes nommées depuis `packages/core/src/agents/runtime/workflow-orchestrator.ts` une fois intégrés. Le port de declarative-agents lui-même n'a PAS besoin d'importer ceux-ci — ils constituent le plancher du workflow, appliqués au niveau du point de dispatch du workflow.

### Structure des modules

| Chemin                                                               | Nouveau / Modifié | Objectif                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Modifié**   | Ajouter 8 nouveaux champs à `SubagentConfig` : `effort`, `permissionMode` (correspond déjà via `approvalMode` — garder les deux ? voir D7 ci-dessous), `mcpServers`, `hooks`, `maxTurns` (promu au niveau supérieur, déprécier `runConfig.max_turns`), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Modifié**   | Étendre `parseSubagentContent` / `serializeSubagent` pour assurer l'aller-retour des nouveaux champs ; étendre les appels de `SubagentValidator`                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (chemin supposé) | **Modifié**   | Ajouter la validation par champ correspondant aux messages d'erreur de DL7 : `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` etc.                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Nouveau**       | Source unique de vérité pour les constantes d'énumération : `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Reproduit Claude Code 2.1.168 à l'identique.                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Modifié**   | Les nouveaux champs ont par défaut la valeur undefined ; aucun changement de comportement                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Modifié**   | Lire les nouveaux champs depuis le `SubagentConfig` résolu lors de la construction des options du sous-agent (`model`, `maxTurns`, `permissionMode`, `effort`) ; faire passer la sémantique de surcharge par appel de `isolation` pour #4721                                                                              |
| `packages/cli/src/config/config.ts`                                | **Modifié**   | Ajouter le flag `--agent <name>` ; résoudre par rapport à `SubagentManager` au démarrage ; erreur si le nom ne se résout pas                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Modifié**   | Tests pour la résolution du flag `--agent` + chemin d'erreur                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Modifié**   | Ajouter le mapping pour les nouveaux champs lors de l'importation des fichiers `.md` de Claude (`mcpServers`, `hooks`, `maxTurns` au niveau supérieur, `memory`, `isolation`, etc.)                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Nouveau**       | Tests de snapshot pour les listes d'énumérations ; tests de parsing/sérialisation aller-retour                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Modifié**   | Tests pour la validation des nouveaux champs, la priorité, les messages d'erreur                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Modifié**   | Tests pour l'intégration des nouveaux champs dans le runtime du sous-agent                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (si existant) ou `docs/declarative-agents.md`   | **Nouveau**       | Référence destinée aux utilisateurs : schéma à 16 champs + exemples                                                                                                                                                                                                                         |

### D7. permissionMode vs approvalMode — faire le pont, pas remplacer

**Décision :** Accepter à la fois `permissionMode` (compatible Claude) et l'actuel `approvalMode` (compatible qwen) dans le frontmatter. Au parsing, si `permissionMode` est défini, le mapper vers `approvalMode` en utilisant le tableau existant dans `claude-converter.ts:195-208` (`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`). Si les deux sont présents, `approvalMode` l'emporte (plus spécifique à qwen-code) et émettre un événement de télémétrie de type `tengu_frontmatter_shadow_*` indiquant que les deux ont été définis. **Justification :** Préserve la rétrocompatibilité avec les `.qwen/agents/*.md` existants qui utilisent `approvalMode`, tout en acceptant le `permissionMode` de Claude Code à l'identique afin que les utilisateurs puissent intégrer des fichiers d'agents Claude Code sans modification.

### Tableau de correspondance du schéma

| Champ Claude Code 2.1.168  | Champ qwen-code                                    | Adaptation                                                                                                   | Notes                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | aucune                                                                                                         | identique, requis                                                                                      |
| `description`              | `description`                                      | aucune                                                                                                         | identique, requis                                                                                      |
| `model`                    | `model`                                            | accepter `inherit`, `fast`, `haiku`, `sonnet`, `opus`, ou `authType:model-id`                                  | qwen-code supporte déjà le vocabulaire plus large ; `inherit` est nouveau                                      |
| `tools`                    | `tools`                                            | accepter string\|array ; `*` → undefined (hériter de tout)                                                          | déjà supporté en tant qu'array ; ajouter la gestion de string + `*`                                                    |
| `disallowedTools`          | `disallowedTools`                                  | accepter string\|array ; **toujours transporté séparément de `tools`**                                             | règle de priorité (#4821 « ignoré si tools est défini ») appliquée par les **appelants**, pas le parser                    |
| `effort`                   | `effort` (nouveau)                                     | enum `low/medium/high/xhigh/max` + entier ; alias `med → medium`                                             | l'effet runtime est spécifique à qwen (mapper vers le paramètre d'effort de réflexion existant si présent, sinon stocker et ignorer) |
| `permissionMode`           | `permissionMode` (nouveau) + fait le pont vers `approvalMode` | enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan` ; tableau de correspondance selon D7                         | accepter le format Claude à l'identique                                                                            |
| `mcpServers`               | `mcpServers` (nouveau)                                 | array de (string \| `{name: spec}`) ; valider par élément, supprimer les mauvaises entrées avec un warning                           | intégration dans le runtime MCP dans P4                                                                            |
| `hooks`                    | `hooks` (nouveau)                                      | objet correspondant à la forme des hooks de settings.json                                                                    | intégration dans le runtime des hooks dans P4                                                                           |
| `maxTurns`                 | `maxTurns` (nouveau niveau supérieur)                         | entier positif ; accepter les chaînes numériques pour la parité                                                           | **promu depuis `runConfig.max_turns`** ; garder la forme imbriquée comme alias déprécié                             |
| `skills`                   | `skills` (nouveau)                                     | array de noms de skills ; chaîne séparée par des virgules également acceptée                                                   | runtime : précharger via skillManager au démarrage de l'agent                                                      |
| `initialPrompt`            | `initialPrompt` (nouveau)                              | string ; uniquement des espaces → undefined ; ne se déclenche que lorsque l'agent est la session principale                                   | intégré via le chemin du flag `--agent`                                                                            |
| `memory`                   | `memory` (nouveau)                                     | enum `user/project/local` ; charge depuis `.qwen/agent-memory/<name>/` etc.                                      | runtime dans P4                                                                                            |
| `background`               | `background`                                       | accepter bool ou string `"true"/"false"` ; uniquement truthy → true                                                   | déjà supporté ; assouplir les règles de parsing                                                                    |
| `isolation`                | `isolation` (nouveau)                                  | enum **uniquement** `["worktree"]`                                                                                 | runtime géré par la PR workflow (#4732 P3+) ; le registre ne fait que transporter le champ                                |
| `color` (non documenté #16) | `color`                                            | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]` ; valeurs en dehors supprimées silencieusement | déjà dans `SubagentConfig` de qwen ; durcir la validation pour correspondre à la liste d'autorisation de Claude Code                      |
### Plan de tests TDD

| Bloc                        | Fichier de test                                | Ce qui est vérifié                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes enum du schéma        | `agent-frontmatter-schema.test.ts` (nouveau) | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` correspondent byte pour byte à Claude Code 2.1.168 (snapshot)                                                     |
| Parser — cas nominal          | `subagent-manager.test.ts`               | Analyse round-trip de `.qwen/agents/test.md` avec les 16 champs → l'enregistrement émis a la forme attendue                                                                                                        |
| Parser — champs requis     | `subagent-manager.test.ts`               | L'absence de `name` retourne null + log warn ; l'absence de `description` retourne null + log warn                                                                                                                 |
| Parser — validation des enums     | `subagent-manager.test.ts`               | Des valeurs invalides pour `permissionMode` / `memory` / `isolation` / `effort` / `color` émettent chacune un warn spécifique (correspondant au libellé DL7) et le champ est ignoré                                                                |
| Parser — types de champs tolérants | `subagent-manager.test.ts`               | `background: "true"` → `true` ; `maxTurns: "5"` → `5` ; `effort: "med"` → `"medium"` ; `tools: "Read,Edit"` → `["Read","Edit"]` ; `tools: "*"` → undefined                                                |
| Parser — liste blanche des couleurs     | `subagent-manager.test.ts`               | `color: "magenta"` est ignoré silencieusement (pas d'erreur), `color: "blue"` est conservé                                                                                                                       |
| Particularité du champ skills    | `subagent-manager.test.ts`               | L'omission de `skills` résulte en `skills: []` (correspond au comportement d'émission DL7 de Claude Code)                                                                                                                    |
| Précédence de résolution        | `subagent-manager.test.ts`               | Même `name` dans projet + utilisateur → le projet l'emporte ; dans utilisateur + intégré → l'utilisateur l'emporte ; dans extension + intégré → l'extension l'emporte                                                                                  |
| Déduplication des inodes                  | `subagent-manager.test.ts`               | Deux chemins vers le même inode (symlink) → un seul enregistrement, log émis                                                                                                                                      |
| Pont permissionMode        | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → `approvalMode: yolo` résolu ; les deux définis → `approvalMode` l'emporte + télémétrie                                                                                       |
| Flag CLI `--agent`           | `packages/cli/src/config/config.test.ts` | Le flag définit l'agent du thread principal ; un nom non résolu lève une erreur avec `Agent type '<x>' not found. Available agents: …`                                                                                            |
| Fallback flou de l'outil Agent    | `agent.test.ts`                          | `subagent_type: "Test_Engineer"` résout vers un `test-engineer` enregistré via la normalisation NFKC-lowercase                                                                                            |
| Erreur not-found de l'outil Agent   | `agent.test.ts`                          | `subagent_type` non résolu → le message d'erreur correspond à `Agent type '<x>' not found. Available agents: <list>`                                                                                             |
| Contrat de workflow            | `agent-frontmatter-schema.test.ts`       | L'interface exportée `getAgentByName(name)` retourne le `SubagentConfig` complet incluant `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (consommable par le workflow PR #4732) |

### Plan de PR par phases

| Phase  | Titre                                                                                                                          | Périmètre                                                                                                                                              | Bloqué par                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **P1** | `feat(core) : champs de schéma d'agent déclaratif (effort, permissionMode, maxTurns au niveau supérieur, memory, isolation, liste blanche des couleurs)` | Ajout des champs à `SubagentConfig` ; extension du parser + validateur + sérialiseur ; dépréciation de `runConfig.max_turns` ; ajout du module de constantes enum ; tests          | Aucun                               |
| **P2** | `feat(core) : branchement des nouveaux champs d'agent dans le runtime de l'outil Agent`                                                                    | Acheminement de `model`, `effort`, `maxTurns`, du pont `permissionMode`/`approvalMode` vers le site d'appel `AgentTool.execute()` → `AgentHeadless.create()` ; tests | P1                                 |
| **P3** | `feat(cli) : flag --agent pour la sélection de l'agent du thread principal`                                                                      | Ajout de `--agent <name>` à `CliArgs` ; résolution au démarrage ; chemin d'erreur ; tests                                                                           | P1                                 |
| **P4** | (optionnel, scope-creep) `feat(core) : mcpServers + hooks + skills + initialPrompt + runtime memory`                             | Branchement des quatre champs "métadonnées uniquement en v1" vers des effets runtime réels                                                                             | P1, plus les sous-systèmes skill/MCP/hook |

Chaque PR cible un delta ≤ 800 LOC (tests exclus) ; P1 est le plus important avec ~600 LOC de validateur + tests.

---

## Phase 3 — Matrice de coordination avec le portage du workflow (#4721 / PR #4732)

| Fonctionnalité declarative-agents                                             | Interaction avec le workflow                                                                                                                                                                   | Propriétaire                                                               | Bloqué par                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Champ `name` comme clé de registre                                       | Chaîne de recherche `opts.agentType` du workflow ([#4721][i4721] explicite)                                                                                                                    | **cette PR** définit le contrat du registre ; **la PR workflow** le consomme | aucun — la forme du registre peut se stabiliser en premier      |
| Champ `disallowedTools` sur l'agent                                       | Le workflow fait l'UNION avec le plancher codé en dur `[SEND_MESSAGE, EXIT_PLAN_MODE]` (selon [#4721][i4721] §2 — vérifié par rapport au diff de la PR #4732 : `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`)   | **cette PR** porte le champ ; **la PR workflow** fait l'union au dispatch       | la PR workflow #4732 P3 est mergée                     |
| Champ `tools` sur l'agent                                                 | Le workflow transmet verbatim au `ToolConfig.tools` du sous-agent                                                                                                                      | **cette PR** porte le champ ; **la PR workflow** le branche                   | PR workflow #4732 P3                           |
| Champ `model` sur l'agent                                                 | Le `opts.model` du workflow écrase par appel ; le `model` de l'agent est la valeur par défaut                                                                                                             | **cette PR** porte le champ ; **la PR workflow** résout la précédence      | PR workflow #4732 P3                           |
| Champ `effort` sur l'agent                                                | L'écrasement au site d'appel du workflow l'emporte ; fallback sur la valeur par défaut de l'agent                                                                                                                             | **cette PR** porte le champ ; **la PR workflow** résout                 | PR workflow #4732 P3                           |
| Champ `permissionMode` sur l'agent                                        | Mappe vers l'`approvalMode` du sous-agent au dispatch ; l'écrasement au site d'appel du workflow l'emporte                                                                                                        | **cette PR** porte le champ via le pont D7 ; **la PR workflow** le branche     | PR workflow #4732 P3                           |
| Champ `maxTurns` sur l'agent                                              | Remplace le `WORKFLOW_SUBAGENT_MAX_TURNS = 50` codé en dur du workflow lorsque l'agent le définit                                                                                                    | **cette PR** porte le champ ; **la PR workflow** résout la précédence      | PR workflow #4732 P3                           |
| Champ `isolation: 'worktree'` sur l'agent                                 | Valeur par défaut ; l'écrasement par appel `opts.isolation` prime ([#4721][i4721] §3)                                                                                                                       | **cette PR** porte le champ ; **la PR workflow** possède le runtime             | PR workflow #4732 P3+ (lève actuellement une erreur dans P1) |
| Champ `initialPrompt` sur l'agent                                         | Le workflow ne l'utilise **pas** (ne se déclenche que lorsque l'agent est la session principale via `--agent`)                                                                                                     | **cette PR** + **CLI**                                               | aucun (indépendant)                             |
| `memory`, `mcpServers`, `hooks`, `skills`                              | Le workflow n'a pas de traitement spécial au-delà de la transmission au runtime du sous-agent                                                                                                            | **cette PR** porte les champs ; branchement runtime dans P4 / futur           | PRs futures                                     |
| Mises à jour de `EXCLUDED_TOOLS_FOR_SUBAGENTS`                                 | La PR workflow #4732 ajoute `WORKFLOW` à l'ensemble (selon la découverte issue/contexte PR — bien qu'une réfutation adversaire note que ce n'est PAS encore dans `agent-core.ts` sur `main`, seulement dans worktree) | **la PR workflow** en est propriétaire ; cette PR n'est pas modifiée                             | aucun                                           |
| Forme canonique du nom d'outil pour le plancher du workflow (`ToolNames.SEND_MESSAGE`) | Cette PR n'importe pas les constantes du plancher ; elle ne porte que les chaînes `disallowedTools` telles qu'écrites. La PR workflow est propriétaire de la canonisation.                                              | **PR workflow**                                                     | PR workflow #4732                              |
| Ordre de livraison                                                         | Cette PR (P1+P2+P3) est livrée indépendamment du workflow. La PR workflow #4732 P3 est conditionnée à l'importabilité d'un résolveur de type `getAgentByName()` de cette PR.                                      | parallèle jusqu'à P3 du workflow                                       | P3 du workflow lit depuis les exports de cette PR       |
**Pas de blocage circulaire :** cette PR et la PR de workflow peuvent être fusionnées en parallèle lors de leurs phases P1/P2. Elles se synchronisent au niveau de workflow-P3, qui a besoin du résolveur de registre de cette PR. Si cette PR est fusionnée en premier, workflow-P3 lira à partir de celle-ci. Si la PR de workflow est fusionnée en premier, elle sera livrée avec la recherche `subagent_type` existante (retournant les valeurs par défaut du workflow en cas d'absence) et basculera vers le résolveur plus riche une fois cette PR fusionnée.

---

## Phase 4 — Risques et questions ouvertes

### Risques

| #   | Risque                                                                                                                                                                                                | Mesure d'atténuation                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Dérive du schéma entre les versions mineures de Claude Code (2.1.168 → 2.1.x)                                                                                                                                   | Épingler le module de constantes d'énumération à "vérifié avec 2.1.168" avec un commentaire de documentation ; relancer le strings-grep sur les nouvelles versions dans le cadre de la skill `feature-reverse` |
| R2  | `runConfig.max_turns` → `maxTurns` de premier niveau est un changement de schéma incompatible pour les fichiers `.qwen/agents/*.md` existants                                                                                     | Conserver la forme imbriquée comme alias obsolète avec une dépréciation d'un cycle ; émettre un warn lors de l'analyse, documenter dans le CHANGELOG                                                     |
| R3  | Perte de données lors de la conversion aller-retour `permissionMode` ↔ `approvalMode` (Claude a 6 modes, qwen en a environ 4)                                                                                                            | Mapper explicitement les deux directions selon D7 ; émettre de la télémétrie en cas de définition double ; ne PAS réécrire silencieusement lors de la sauvegarde                                                             |
| R4  | Les nouveaux champs (`hooks`, `mcpServers`, `skills`, `memory`) sont présents dans le registre mais n'ont pas d'implémentation runtime dans v1 → les utilisateurs peuvent les définir sans obtenir d'effet, silencieusement                                                     | Documenter clairement le périmètre de la v1 ; émettre un log d'information unique par agent lorsqu'un champ "présent mais sans runtime" n'est pas vide                                          |
| R5  | La vérification adversarial-verify a signalé que `EXCLUDED_TOOLS_FOR_SUBAGENTS` n'inclut PAS `WORKFLOW` sur `main` — cela peut signifier que le portage du workflow n'est pas encore fusionné ou que la garde recursive-fanout est manquante | Confirmer avec l'auteur de la PR de workflow (LaZzyMan = moi-même) que la garde est intégrée avec la PR #4732, et non dans ce portage                                                     |
| R6  | Le comportement projectSettings où l'arbre externe l'emporte sur l'arbre interne (Q5) est un piège s'il est reproduit                                                                                                             | qwen-code choisit explicitement **l'arbre le plus interne l'emporte** ; testé via le fixture R5                                                                                         |
| R7  | Le champ `color` est documenté comme `@internal` dans le texte descriptif du binaire — nous portons peut-être quelque chose qu'Anthropic ne prend explicitement pas en charge                                                        | Le porter mais le marquer `@internal` dans la documentation de qwen-code également ; le traiter comme UI uniquement ; ne pas l'exposer dans la documentation de référence destinée aux utilisateurs                                             |

### Questions ouvertes — résolutions proposées

| #   | Question                                                                                                                                                       | Résolution                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | L'omission de `color` dans #4821 est-elle intentionnelle ?                                                                                                                  | **Considérer comme intentionnel**. Porter le champ ; ne PAS le mentionner dans la documentation destinée aux utilisateurs, sauf comme "disponible, interne".                                                                                                                                                                                                                                            |
| Q2  | Comportement tolérant de DL7 : documenter ou bricoler ?                                                                                                                       | **Le reproduire**. Accepter `background: "true"`, `maxTurns: "5"`, `effort: "med"` pour assurer la parité, même si ce n'est pas documenté. Ajouter des tests.                                                                                                                                                                                                                                |
| Q3  | Pourquoi l'énumération d'isolation diffère-t-elle entre le schéma d'agent et le schéma de session en arrière-plan ?                                                                                 | **Documenter la divergence dans un commentaire de code** ; "no isolation" = champ omis, pas une valeur d'énumération.                                                                                                                                                                                                                                                          |
| Q4  | `--agents <json>` (pluriel, flagSettings) doit-il être intégré en v1 ?                                                                                                    | **Reporter à P4**. Surface CLI pour les utilisateurs avancés ; la v1 livre uniquement `--agent <name>` (singulier), ce qui est ce dont #4821 se soucie.                                                                                                                                                                                                                                 |
| Q5  | Priorité entre arbre interne et arbre externe pour les `.qwen/agents/` imbriqués ?                                                                                                | **L'arbre le plus interne l'emporte**. Outrepasser le comportement accidentel de Claude Code où l'externe l'emporte. Fixture de test dans P1.                                                                                                                                                                                                                                                          |
| Q6  | Priorité entre `tools` et `disallowedTools` : #4821 dit "ignoré si tools est défini" ; #4721 dit "union avec le plancher du workflow"                                          | **Le registre est une donnée passive**. Le parser préserve les deux champs indépendamment. Les règles de priorité se trouvent au point de dispatch (Agent tool / workflow). Résout la contradiction.                                                                                                                                                                                   |
| Q7  | Forme canonique du nom d'outil pour le plancher disallowedTools du workflow — vérifié par rapport à la PR #4732 comme étant `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`            | **Ne concerne pas cette PR** — relève de la PR de workflow. Documenter uniquement dans la matrice de coordination.                                                                                                                                                                                                                                                              |
| Q8  | La résolution de clôture de #2409 affecte-t-elle quelque chose ?                                                                                                                   | **Hériter des directives de #2409 "promouvoir model + maxTurns au premier niveau"**. Déjà intégré dans ce plan.                                                                                                                                                                                                                                                      |
| Q9  | Les agents de niveau `extension` dans la priorité `SubagentLevel` existante de qwen-code doivent-ils rester au-dessus de `builtin` (actuel) ou en dessous (Claude Code n'a pas d'équivalent) ? | **Garder `extension > builtin`**. Les extensions sont installées par l'utilisateur ; les intégrations sont les valeurs par défaut du fournisseur. L'installé par l'utilisateur l'emporte.                                                                                                                                                                                                                                        |
| Q10 | Les issues #4821, #4721, #4732 sont-elles entièrement spécifiées pour le contrat proposé par ce document ?                                                                             | **Poster un commentaire de coordination sur #4821** liant ce document, résumant les décisions champ par champ, et demandant aux mainteneurs d'accuser réception : (a) parité du schéma avec les 16 champs de Claude Code 2.1.168, (b) pont D7 `permissionMode`/`approvalMode`, (c) ordre de priorité D2, (d) résolution de la contradiction `tools`/`disallowedTools` par le registre en tant que donnée passive. |

### Actions de coordination

| #   | Action                                                                       | Où                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Poster un résumé champ par champ + 5 décisions sur #4821 pour accusé de réception des mainteneurs        | commentaire sur #4821                                     |
| A2  | Créer un lien croisé de ce document depuis #4721 en notant la matrice de la Phase 3                         | commentaire sur #4721                                     |
| A3  | Une fois la P1 de ce portage fusionnée, notifier #4732 pour passer au résolveur plus riche          | commentaire sur la PR #4732 (quand ce sera prêt)                     |
| A4  | Relancer strings-grep sur la prochaine version mineure de Claude Code pour la détection de dérive du schéma | cron job de la skill `feature-reverse` (manuel jusqu'à nouvel ordre) |
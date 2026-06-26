# Sortie structurée (`--json-schema`) — Conception

Ce document décrit les décisions d'implémentation derrière la
fonctionnalité headless `--json-schema`. L'utilisation côté utilisateur
est décrite dans
[`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Objectif

Lors des exécutions headless (`qwen -p`, stdin redirigé ou invite positionnelle),
permettre à l'appelant de contraindre la réponse finale du modèle à un
schéma JSON fourni par l'utilisateur et de présenter la charge utile validée
sous forme de sortie lisible par machine que les scripts et les outils en aval
peuvent consommer directement. Le texte incident du modèle pendant la
planification est autorisé, mais l'exécution doit se terminer par une charge
utile conforme au schéma, et non par du texte libre.

## Approche : outil synthétique dont le schéma de paramètre EST le schéma utilisateur

Lorsque `--json-schema` est défini, `Config.createToolRegistry` enregistre un
outil synthétique `structured_output`
([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)).
Son `parametersJsonSchema` est exactement le schéma transmis par l'utilisateur ;
sa méthode `execute()` renvoie un message d'arrêt `llmContent`. L'infrastructure
d'appel d'outil valide déjà les arguments par rapport à `parametersJsonSchema`
côté client (via Ajv dans `BaseDeclarativeTool.build()`), donc « le modèle a
renvoyé une réponse conforme au schéma » se résume à « le modèle a appelé
`structured_output` avec succès ».

Trois propriétés en découlent naturellement :

1. **Aucun chemin de validation sur mesure.** `validateToolParams`, basé sur
   Ajv, s'exécute déjà à l'intérieur de `BaseDeclarativeTool.build()` et rejette
   les arguments non conformes avant même que `execute()` ne soit déclenché.
2. **Comportement de reprise standard.** Un échec de validation est présenté au
   modèle comme une erreur d'appel d'outil, de la même manière que toute autre
   erreur d'arguments d'outil. Le modèle voit le message Ajv et peut se corriger
   au tour suivant.
3. **Indépendant du fournisseur.** Gemini, OpenAI et Anthropic sérialisent tous
   les schémas de paramètres d'outil de la même manière (via l'abstraction
   `DeclarativeTool`) ; l'outil synthétique se branche sur les trois.

L'outil est enregistré avec `alwaysLoad: true` afin que l'infrastructure de
chargement à la demande ToolSearch (introduite dans #3589 — maintient la
surface d'outils exposée petite en différant les outils rarement utilisés
derrière un appel de recherche, ne montant leurs schémas complets que lorsque le
modèle les demande) ne le cache jamais au modèle. Sans ce drapeau, le modèle
ne saurait pas que le contrat terminal existe.

## Pipeline de validation à l'analyse

`resolveJsonSchemaArg(raw)` dans
[`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts)
effectue quatre vérifications avant que le schéma n'atteigne
`Config.createToolRegistry` :

1. **Résolution de la source.** Accepte soit un littéral JSON en ligne, soit
   `@chemin/vers/fichier`. Le formulaire `@path` exécute d'abord `stat` sur le
   chemin résolu, refuse les fichiers non réguliers (FIFO, périphériques
   caractères, répertoires), limite la taille à 4 Mio, et en cas d'échec
   d'analyse JSON émet une erreur générique (sans préfixe de contenu de fichier
   dans stderr).
2. **Forme JSON.** Le résultat analysé doit être un objet non tableau — les
   primitives, booléens et tableaux sont rejetés avec un message clair.
3. **La racine accepte les objets** —
   [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts).
   Les API d'appel de fonction passent toujours des objets comme arguments
   d'outil ; un schéma racine comme `{type: "array"}` enregistrerait un outil
   inutilisable. La visite traite `type`, `const`, `enum`, `anyOf`, `oneOf`,
   `allOf`, `not`, `if` / `then` / `else`, et `$ref` racine.
4. **Compilation Ajv stricte** —
   [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts).
   Une instance Ajv dédiée avec `strictSchema: true` révèle les fautes de
   frappe comme `propertees` que le validateur d'exécution permissif
   engloutirait silencieusement.

### Limites de `schemaRootAcceptsObject`

La visite est intentionnellement au mieux. Elle capture les cas univoques
« cela ne peut jamais accepter un objet » et reporte tout ce qui nécessite une
analyse de satisfiabilité complète du schéma à Ajv à l'exécution.

**Décidé à l'analyse :**

| Modèle                                                   | Résultat                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `type` présent, n'inclut pas `"object"`                  | rejeter                                                          |
| `type: ["object", "null"]` etc.                          | accepter                                                         |
| `const` : valeur non objet                               | rejeter                                                          |
| `enum` : aucun membre objet (incl. vide)                 | rejeter                                                          |
| `anyOf`/`oneOf` : tableau vide                           | rejeter                                                          |
| `anyOf`/`oneOf` : aucune branche n'admet d'objet         | rejeter                                                          |
| `allOf` : une branche est `false` ou rejette un objet    | rejeter                                                          |
| `$ref` racine (avec ou sans `type` frère)                | rejeter                                                          |
| `not` : `{type: "object"}` nu (sans mots-clés restrictifs) | rejeter                                                          |
| `not` : `{type: "object", required: […], …}` etc.        | accepter (les mots-clés restrictifs laissent certains objets satisfiables ; reporter) |
| `if: true` + `then` rejette un objet                     | rejeter                                                          |
| `if: false` + `else` rejette un objet                    | rejeter                                                          |

**Reporté à Ajv à l'exécution :**

- `$ref` à l'intérieur des branches `anyOf` / `oneOf` / `allOf` (opaque — la
  résolution locale de `$ref` nécessiterait la détection de cycles, les
  échappements JSON Pointer, et la gestion de `$defs` vs `definitions` ; le coût
  dépasse le bénéfice pour une vérification au mieux à l'analyse).
- `if` dont la valeur est un schéma d'objet (décidable uniquement par rapport à
  une valeur candidate).
- Motifs `anyOf` / `oneOf` / `const` niés plus complexes que `not.type`.
- Exposition ReDoS arbitraire via `pattern` (fourni par l'utilisateur ; le
  modèle de menace est limité car le drapeau est un argument CLI, pas une entrée
  réseau).

Le chemin de sortie `maxSessionTurns` ajoute un indice spécifique à
`--json-schema` indiquant aux utilisateurs le symptôme courant de blocage
(le modèle n'a jamais appelé `structured_output`) et ses deux causes probables
(outil refusé via les permissions / schéma insatisfiable) afin que la
dégradation à l'exécution fournisse des diagnostics visibles par l'utilisateur.

## Temps d'exécution : répartition des tours

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
gère la répartition à l'exécution. Les spécificités de la sortie structurée :

### Pré-analyse et suppression des frères

Lorsque le modèle émet `structured_output` en même temps que d'autres outils
dans le même tour d'assistant, l'appel synthétique est le contrat terminal. La
pré-analyse dans `processToolCallBatch` filtre `requestsToExecute` pour ne
conserver que les appels `structured_output`, de sorte que les frères ayant des
effets de bord (`write_file`, `run_shell_command`, `edit`, …) ne s'exécutent
jamais.

Exemples de lots (lorsque `--json-schema` est actif) :

| Le modèle émet                                           | Comportement                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[write_file(…), structured_output(…)]`                  | `write_file` est ignoré. `structured_output` valide, l'exécution se termine.                                                                                                                                                                                                                                |
| `[structured_output(mauvais-args), structured_output(bon)]` | Le premier échoue à la validation Ajv ; le second réussit. L'exécution se termine avec les arguments du second appel.                                                                                                                                                                                               |
| `[structured_output(mauvais-args), write_file(…)]`           | `structured_output(mauvais)` échoue. `write_file` est également ignoré (il a été supprimé en amont). Le modèle voit les deux : le message d'erreur Ajv pour l'appel structuré, et un résultat d'outil synthétisé `"Ignoré : …"` pour l'appel à effet de bord. Au tour suivant, le modèle peut réémettre les deux ou corriger l'appel structuré seul. |
| `[autre_outil_a, autre_outil_b]` (pas de `structured_output`) | La pré-analyse est inactive. Les deux outils s'exécutent normalement ; l'exécution NE se termine PAS.                                                                                                                                                                                                                                          |

Le corps synthétisé « Ignoré : » comporte deux variantes :

- **Chemin de réussite** (un appel structuré a capturé le contrat ce tour-ci) :
  `"Ignoré : l'appel structured_output de ce tour a eu priorité comme sortie terminale."` — court, car la session se termine immédiatement et aucun consommateur (modèle ou SDK) n'agit dessus.
- **Chemin de reprise** (aucun appel structuré capturé, le modèle obtient un
  autre tour) : ajoute `"Réeffectuez cet appel dans un tour séparé si nécessaire."` — c'est le seul cas actionnable par le modèle.

### Parité tour principal / tour de vidange

`processToolCallBatch(batchRequests, setModelOverride)` est défini à
l'intérieur de `runNonInteractive` et appelé depuis :

- La boucle du tour principal (haut de la fonction).
- `drainOneItem` (boucle de réponse aux invites cron / tâches en arrière-plan).

Le tour de vidange est important car `structured_output` est enregistré pour
toute la session, donc une tâche cron ou une réponse de notification POURRAIT
également déclencher l'outil. Le gestionnaire traite les deux sites d'appel
de manière identique au moment de l'invocation ; la seule liaison spécifique
au site d'appel est la variable `modelOverride` à écrire — transmise comme un
setter.

Le **flux de terminaison post-gestionnaire** diffère entre les deux sites :
le chemin du tour principal appelle directement `return emitStructuredSuccess()`,
tandis que le chemin du tour de vidange nécessite une terminaison en deux étapes
(`processToolCallBatch` capture le résultat dans la variable `structuredSubmission`
de la fermeture ; `drainLocalQueue` la vérifie pour arrêter la boucle de vidange,
puis la boucle de retenue la vérifie pour sortir et appeler
`emitStructuredSuccess`). Les deux convergent vers le même bloc terminal, mais
l'indirection supplémentaire dans le chemin de vidange est essentielle — sans
elle, la boucle de vidange continuerait à traiter les éléments en file d'attente
après la capture du résultat structuré.

### Bloc terminal de réussite structurée

`emitStructuredSuccess()` (également défini à l'intérieur de `runNonInteractive`)
est le chemin partagé « nous avons un appel valide, arrêtons-nous » :

1. `registry.abortAll()` annule les agents en arrière-plan en cours — le contrat
   de sortie structurée est à usage unique et ne doit pas entrer en concurrence
   avec les `task_notification` dans l'émission terminale.
2. Retenue bornée (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms) pour que les
   gestionnaires d'annulation naturels des agents venant d'être annulés aient
   une chance d'émettre leur `task_notification` terminale et de la déposer
   dans `localQueue`. La garde de boucle est
   `Date.now() < deadline && registry.hasUnfinalizedTasks()`, donc l'attente
   se termine immédiatement lorsque rien n'est en vol (chemin typique) et ne
   bloque jamais plus que le plafond. Le plafond de 500 ms est au mieux —
   des événements `task_started` orphelins restent possibles sous charge si le
   gestionnaire d'annulation d'un agent particulier dépasse le budget. La
   boucle **ne** vérifie **pas** le signal d'annulation : un SIGINT reçu
   pendant la retenue ou pendant le chemin d'émission qui suit ne court-circuitera
   pas le résultat déjà capturé. Sans la retenue, les consommateurs de flux JSON
   verraient régulièrement des événements `task_started` sans `task_notification`
   correspondante.
3. `flushQueuedNotificationsToSdk(localQueue)` vide tout ce qui est encore en
   file d'attente.
4. `finalizeOneShotMonitors()` (idempotent — sans danger d'appeler deux fois ;
   le chemin du tour de vidange l'a déjà invoqué).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Chemins d'échec

| Cause                                                             | Code de sortie                     | Comportement                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le modèle émet uniquement du texte brut                                       | 1                             | Erreur avec le nombre de tours + aperçu de sortie tronqué (`Output preview`).                                                                                                                                                                                                                                |
| Le modèle n'appelle jamais `structured_output` en `maxSessionTurns` tours | 53                            | `Reached max session turns` + indice `--json-schema` pointant vers le symptôme courant de blocage et ses deux causes probables.                                                                                                                                                             |
| La validation échoue de manière répétée                                       | (finalement 53 via max-tours) | Chaque échec est présenté au modèle au tour suivant avec le message Ajv.                                                                                                                                                                                                          |
| Abandon / SIGINT                                                    | 130                           | Chemin d'annulation. Un résultat structuré n'est normalement pas émis, mais la boucle de retenue de `emitStructuredSuccess()` ne vérifie pas le signal d'annulation — un SIGINT qui arrive après la capture mais avant/pendant l'émission stdout peut quand même vider le résultat. Le code de sortie est le signal fiable. |

## Enveloppe de sortie

Le pipeline d'adaptateur dans
[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
traite la présence de `structuredResult` (détectée via `'structuredResult' in options`,
pas `!== undefined`, afin que le contrat soit préservé même lorsque le modèle
a appelé `structured_output` sans arguments sous un schéma vide) :

- `result` est forcé à `JSON.stringify(payload)` — écrasant tout résumé en
  texte libre accumulé par l'adaptateur.
- Un champ `structured_result` de premier niveau porte l'objet brut pour les
  consommateurs qui ne souhaitent pas re-analyzer la forme stringifiée.
- Les charges utiles `undefined` sont normalisées à `null` (rendues comme le
  JSON littéral `null` dans les deux champs) afin que le champ ne puisse pas
  disparaître silencieusement. En pratique, ce cas de repli est rarement
  atteint : en amont, `turn.ts` applique `(fnCall.args || {})` avant de
  stocker la soumission, donc un appel sans argument contre un schéma vide
  atterrit comme `{}` et s'affiche comme `{}` sur stdout, pas `null`. L'étape
  `?? null` est une défense en profondeur pour le cas strictement `undefined`.

Le mode TEXT écrit uniquement le champ `result` + saut de ligne sur stdout
(tout texte incident d'assistant accumulé pendant l'exécution est ignoré —
non redirigé vers stderr). Le mode JSON émet le journal complet des événements
sous forme de tableau JSON ; `structured_result` se trouve sur le dernier
élément `type: "result"` de ce tableau, pas à la racine du document. Le mode
Stream-json émet chaque message sur sa propre ligne en JSONL ; la ligne de
`result` terminale porte `structured_result`.

## Confidentialité : masquage inter-surfaces

Les arguments soumis via `structured_output` SONT la charge utile structurée.
Sur le chemin de réussite, ils sont déjà sur stdout ; en cas de reprise après
échec de validation, ils peuvent ne jamais atteindre stdout. Dans les deux cas,
les persister sur des surfaces durables sur l'appareil (ou les exporter hors
de l'appareil via la télémétrie) constitue une duplication qui fuit la charge
utile dans un stockage plus persistant que ce que l'utilisateur a demandé. La
règle de masquage est donc « ne jamais persister les arguments de cet outil
synthétique, quel que soit le résultat », et non simplement « dédupliquer ce
qui est déjà sur stdout ».

Deux surfaces doivent masquer les arguments, et elles partagent la même
constante d'espace réservé
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts) :

- `ToolCallEvent.function_args` (télémétrie) — couvre les exports OTLP,
  QwenLogger, ui-telemetry, et le miroir d'événements UI d'enregistrement de
  chat.
- `redactStructuredOutputArgsForRecording` (utilisé par
  `recordAssistantTurn` dans `geminiChat.ts`) — couvre le JSONL
  d'enregistrement de chat sur disque à
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`.
  Les reprises après échec de validation atterrissent également ici — les
  arguments de chaque reprise reçoivent le même espace réservé.

La constante partagée empêche la dérive entre les deux surfaces. Les métriques
d'appel d'outil (durée, succès, décision) sont préservées.

Les hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) ne sont
intentionnellement **pas** masqués — ils reçoivent le `tool_input` brut car
le contrat du hook est « voir ce que l'outil voit ». Ceci est documenté dans la
section Confidentialité de la doc utilisateur comme une mention « Les hooks
voient les arguments bruts » afin que les opérateurs puissent filtrer sur
`tool_name` ou ajouter un masquage côté hook avant d'exécuter `--json-schema`
sur des données sensibles.

Le masquage est intentionnellement limité aux surfaces de **persistance sur
l'appareil** (exports de télémétrie + JSONL d'enregistrement de chat). Le
schéma lui-même voyage toujours vers le fournisseur du modèle à chaque requête
en tant que bloc `parameters` de la déclaration de fonction
`structured_output` — aucun masquage côté fournisseur n'est possible, car le
modèle a besoin du schéma pour remplir le contrat d'appel d'outil. La section
Confidentialité de la doc utilisateur avertit les utilisateurs de garder les
charges utiles des champs `enum` / `const` / `default` / `examples` /
`description` exemptes de secrets pour la même raison.

## Contrôle des permissions

`structured_output` est délibérément exclu de
`PermissionManager.CORE_TOOLS` (l'ensemble des outils soumis à la vérification
de liste blanche `--core-tools`) — aux côtés des autres outils synthétiques
(`agent`, `exit_plan_mode`, `ask_user_question`, `task_stop`,
`send_message`). Les outils découverts dynamiquement (`skill`, MCP) sont une
catégorie d'exclusion distincte qui contourne également la liste blanche pour
des raisons indépendantes. L'outil synthétique n'existe que lorsque
`--json-schema` est défini ; l'ajouter aux mécanismes de liste blanche
signifierait que `--core-tools read_file --json-schema X` supprime
silencieusement le contrat terminal.

Les règles explicites `permissions.deny` et les paramètres `--exclude-tools`
s'appliquent toujours via `PermissionManager.evaluate` → `isToolEnabled`.
Les deux utilisent le même mécanisme de refus et empêchent tous deux
l'enregistrement — la déclaration d'outil est supprimée du registre, donc le
modèle ne voit jamais l'outil. Le résultat typique est que le modèle répond en
texte brut (code de sortie 1). Si le modèle boucle sur d'autres outils sans
produire de texte, il finit par atteindre `maxSessionTurns` (code de sortie 53)
et l'indice `--json-schema` dans `handleMaxTurnsExceededError` indique à
l'utilisateur où chercher.
**`--bare` interaction.** Le mode bare court-circuite le pont de configuration paramètres → CLI : `packages/cli/src/config/config.ts` construit `mergedDeny` comme `[...(bareMode ? [] : settings.permissions.deny), ...]`, donc les refus au niveau des paramètres (et `tools.exclude`) sont ignorés sous `--bare`. Les `--exclude-tools` au niveau des arguments sont ajoutés inconditionnellement dans `mergedDeny`, donc ils s'appliquent toujours. L'outil synthétique est enregistré indépendamment de tout cela (piloté par `jsonSchema`, pas par la liste de refus), donc un refus de `structured_output` uniquement via les paramètres est silencieusement sans effet sous `--bare` tandis que l'outil reste appelable.

## Contextes de sous-agent

`Config.createToolRegistry` accepte une option `forSubAgent: true` qui supprime l'enregistrement synthétique. Les remplacements du sous-agent réutilisent le Config parent via la délégation de prototype (`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`), et `this.jsonSchema` se propage à travers la chaîne de prototypes. Sans ce drapeau, l'outil synthétique s'enregistrerait aussi dans le registre du sous-agent, et un sous-agent l'appelant recevrait le contenu llmContent « session ends now » — mais seules les boucles principales / de vidage de `runNonInteractive` détectent cela comme terminal, donc le sous-agent continuerait de s'exécuter et brûlerait des tokens sur un outil dont le contrat ne peut être honoré par sa boucle.

> **Note du mainteneur.** Cette suppression repose sur l'unique chemin d'appel via `createToolRegistry(forSubAgent: true)`. Tout futur mécanisme de création de sous-agent qui contourne ce chemin fuira l'outil synthétique dans le registre du sous-agent et réintroduira le mode de défaillance de brûlage de tokens à l'infini. Le complément de sécurité serait une garde à l'exécution dans `syntheticOutput.execute()` qui retourne une `fatalError` (ou une opération nulle) lorsqu'elle est invoquée depuis un contexte de sous-agent. Implémentez-en une si un second chemin de fuite apparaît.

## Garde pour outil fantôme MCP

`tool-registry.ts:registerTool` vérifie la carte paresseuse `factories` pour les collisions de noms, pas seulement la carte immédiate `tools`. Si un serveur MCP découvre un outil littéralement nommé `structured_output`, le chemin d'auto-qualification qui existe pour les collisions d'outils immédiats s'applique aussi pour les collisions de factories : l'outil MCP est renommé en `mcp__<server>__structured_output` et la factory synthétique conserve le nom nu. Sans cette garde, un serveur MCP pourrait silencieusement détourner le contrat de sortie structurée.

## Surface de compatibilité

| Combinaison                                                  | Statut                 | Justification                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (ou stdin, ou positionnel)            | Pris en charge         | Chemin headless principal.                                                                                                                    |
| `--json-schema` + `--output-format text` (défaut)           | Pris en charge         | `JSON.stringify(payload)` + saut de ligne.                                                                                                    |
| `--json-schema` + `--output-format json` / `stream-json`     | Pris en charge         | Le champ `structured_result` contient l'objet brut.                                                                                           |
| `--json-schema` + `--bare`                                   | Pris en charge         | `--bare` restreint le registre à `read_file`, `edit`, `run_shell_command` ; l'outil synthétique est enregistré à côté de cet ensemble minimal. |
| `--json-schema` + `-i`                                       | Rejeté à l'analyse     | La TUI n'a pas de contrat terminal pour l'outil synthétique.                                                                                  |
| `--json-schema` + `--input-format stream-json`               | Rejeté à l'analyse     | Contrat unique vs protocole à longue durée.                                                                                                   |
| `--json-schema` + `--acp` / `--experimental-acp`             | Rejeté à l'analyse     | La boucle ACP est indépendante.                                                                                                               |
| `--json-schema` + `--prompt-interactive`                     | Rejeté à l'analyse     | Identique à `-i`.                                                                                                                             |
| `--json-schema` + sans prompt + sans stdin redirigé          | Rejeté à l'analyse     | Le mode headless nécessite un prompt.                                                                                                         |

## Alternatives envisagées

**Invite de réponse consciente du schéma (sans outil synthétique).** Demander au modèle de « répondre avec un JSON correspondant à ce schéma » via la consigne système et analyser le message final de l'assistant à la place. Rejeté car le modèle n'offre aucune garantie syntaxique — la sortie pourrait être encadrée, précédée de bavardage, ou générer des champs hallucinés. La validation des appels d'outils est imposée par la couche d'appel de fonction avant `execute()`, ce qui nous donne une garde syntaxique et sémantique stricte.

**`response_format: {type: "json_schema", …}` d'OpenAI.** Spécifique au fournisseur ; nécessiterait des implémentations parallèles pour Gemini et Anthropic. L'approche d'outil synthétique est indépendante du fournisseur.

**Réorganiser structured_output au début du lot au lieu de filtrer.** Permet aux frères ayant des effets secondaires de s'exécuter si l'appel structuré échoue à la validation. Rejeté car le contrat pour `--json-schema` est « produire une sortie structurée » — si le modèle est dans ce mode, les effets secondaires des frères sont probablement une erreur. Les supprimer complètement est plus sûr ; le modèle voit un tool_result « Skipped: » et peut les réémettre dans un tour séparé.

**Résolution locale de `$ref` dans `schemaRootAcceptsObject`.** Attraperait des schémas comme `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` au moment de l'analyse. Rejeté pour l'instant car le coût (détection de cycles, syntaxe JSON Pointer, `$defs` vs `definitions`, pointeurs partiels, références distantes) dépasse le bénéfice ; l'indice `maxSessionTurns` oriente déjà les utilisateurs vers « schéma insatisfaisable » comme cause probable.

## Travaux en cours

- La validation de réponse consciente du schéma pourrait être dotée d'une garde ReDoS basée sur `pattern` si des utilisateurs réels rencontrent des motifs de backtracking catastrophiques dans les arguments `--json-schema`.
- Ajouts au protocole SDK (SDKs Python / TypeScript / Java exposant un champ `structured_result` typé) — suivre séparément ; [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (fermé non fusionné le 2026-05-11) couvrait ce périmètre avant que le travail cli/core ne soit livré et a été remplacé.

## Index des fichiers

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`, `schemaRootAcceptsObject`, règles de mutex yargs `.check`.
- `packages/cli/src/gemini.tsx` — Garde TUI, plomberie de code de sortie.
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`, `emitStructuredSuccess`, `suppressedOutputBody`, chemin d'échec en texte brut.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — `structuredResult` → enveloppe `result` + `structured_result`.
- `packages/core/src/config/config.ts` — enregistrement avec `registerStructuredOutputIfRequested`, saut `forSubAgent`.
- `packages/core/src/tools/syntheticOutput.ts` — outil synthétique + placeholder `STRUCTURED_OUTPUT_REDACTED_ARGS`.
- `packages/core/src/tools/tool-registry.ts` — renommage de collision de factory pour outils fantômes MCP.
- `packages/core/src/telemetry/types.ts` — rédaction de `function_args`.
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict` avec instance Ajv stricte.
- `packages/cli/src/utils/errors.ts` — indice `--json-schema` de `handleMaxTurnsExceededError`.
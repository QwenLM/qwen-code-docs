# Sortie structurée (`--json-schema`) — Conception

Ce document résume les décisions d'implémentation derrière la fonctionnalité sans interface `--json-schema`. L'utilisation côté utilisateur se trouve dans [`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Objectif

Dans les exécutions sans interface (`qwen -p`, entrée standard redirigée ou invite positionnelle), permet à l'appelant de contraindre la réponse finale du modèle à un schéma JSON fourni par l'utilisateur et de présenter la charge utile validée sous forme de sortie lisible par machine que les scripts et les outils en aval peuvent consommer directement. Le texte accessoire du modèle pendant la planification est autorisé, mais l'exécution doit se terminer avec une charge utile conforme au schéma, et non avec du texte libre.

## Approche : outil synthétique dont le schéma de paramètres EST le schéma utilisateur

Lorsque `--json-schema` est défini, `Config.createToolRegistry` enregistre un outil synthétique `structured_output` ([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)). Son `parametersJsonSchema` est exactement le schéma passé par l'utilisateur ; sa méthode `execute()` retourne un message d'arrêt `llmContent`. L'infrastructure d'appel d'outil valide déjà les arguments par rapport à `parametersJsonSchema` côté client (via Ajv dans `BaseDeclarativeTool.build()`), donc « le modèle a retourné une réponse conforme au schéma » se réduit à « le modèle a appelé `structured_output` avec succès ».

Trois propriétés en découlent gratuitement :

1. **Aucun chemin de validation personnalisé.** `validateToolParams` basé sur Ajv s'exécute déjà à l'intérieur de `BaseDeclarativeTool.build()` et rejette les arguments non conformes avant que `execute()` ne soit jamais déclenché.
2. **Comportement de réessai standard.** Un échec de validation remonte au modèle comme une erreur d'appel d'outil, de la même manière que toute autre erreur d'arguments d'outil. Le modèle voit le message Ajv et peut se corriger au tour suivant.
3. **Indépendant du fournisseur.** Gemini, OpenAI et Anthropic sérialisent tous les schémas de paramètres d'outil de la même manière (via l'abstraction `DeclarativeTool`) ; l'outil synthétique se branche sur les trois.

L'outil est enregistré avec `alwaysLoad: true` afin que l'infrastructure de chargement à la demande ToolSearch (introduite dans #3589 — maintient la surface d'outil exposée petite en différant les outils rarement utilisés derrière un appel de recherche, ne montant leurs schémas complets que lorsque le modèle le demande) ne le cache jamais au modèle. Sans ce drapeau, le modèle ne saurait pas que le contrat terminal existe.

## Pipeline de validation à l'analyse

`resolveJsonSchemaArg(raw)` dans [`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) effectue quatre vérifications avant que le schéma n'atteigne `Config.createToolRegistry` :

1. **Résolution de la source.** Accepte soit un littéral JSON en ligne, soit `@chemin/vers/fichier`. La forme `@chemin` exécute d'abord `stat` sur le chemin résolu, refuse les fichiers non réguliers (FIFO, périphériques caractères, répertoires), limite la taille à 4 Mio, et en cas d'échec d'analyse JSON émet une erreur générique (sans préfixe de contenu de fichier dans stderr).
2. **Forme JSON.** Le résultat analysé doit être un objet non-tableau — les primitives, booléens et tableaux sont rejetés avec un message clair.
3. **La racine accepte les objets** — [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts). Les API d'appel de fonction passent toujours des objets comme arguments d'outil ; un schéma racine comme `{type: "array"}` enregistrerait un outil inutilisable. La parcours gère `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, `if` / `then` / `else`, et `$ref` racine.
4. **Compilation Ajv stricte** — [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts). Une instance Ajv dédiée avec `strictSchema: true` fait remonter les fautes de frappe comme `propertees` que le validateur d'exécution permissif avalerait silencieusement.

### Limites de `schemaRootAcceptsObject`

Le parcours est délibérément au mieux. Il capture les cas non ambigus « cela ne peut jamais accepter un objet » et reporte tout ce qui nécessite une analyse de satisfiabilité complète du schéma à Ajv à l'exécution.

**Décidé à l'analyse :**

| Motif                                                | Résultat                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `type` présent, n'inclut pas `"object"`             | rejeter                                                            |
| `type: ["object", "null"]` etc.                        | accepter                                                            |
| `const` : valeur non-objet                              | rejeter                                                            |
| `enum` : aucun membre objet (incl. vide)                | rejeter                                                            |
| `anyOf`/`oneOf` : tableau vide                           | rejeter                                                            |
| `anyOf`/`oneOf` : aucune branche n'admet d'objet               | rejeter                                                            |
| `allOf` : une branche est `false` ou rejette l'objet       | rejeter                                                            |
| `$ref` racine (avec ou sans `type` frère)           | rejeter                                                            |
| `not` : `{type: "object"}` nu (aucun mot-clé de restriction) | rejeter                                                            |
| `not` : `{type: "object", required: […], …}` etc.       | accepter (les mots-clés de restriction laissent certains objets satisfiables ; report) |
| `if: true` + `then` rejette l'objet                     | rejeter                                                            |
| `if: false` + `else` rejette l'objet                    | rejeter                                                            |
**Reporté à Ajv à l'exécution :**

- `$ref` à l'intérieur de branches `anyOf` / `oneOf` / `allOf` (opaque — la résolution de `$ref` locale nécessiterait la détection de cycles, les échappements JSON Pointer, et la gestion de `$defs` vs `definitions` ; le coût dépasse le bénéfice pour une vérification au meilleur effort en phase d'analyse).
- `if` dont la valeur est un schéma d'objet (décidable uniquement par rapport à une valeur candidate).
- Motifs négatifs de `anyOf` / `oneOf` / `const` plus complexes que `not.type`.
- Exposition ReDoS arbitraire via `pattern` (fourni par l'utilisateur ; le modèle de menace est restreint car le drapeau est un argument CLI, pas une entrée réseau).

Le chemin de sortie `maxSessionTurns` ajoute un indice spécifique à `--json-schema` pointant les utilisateurs vers le symptôme courant de blocage (le modèle n'a jamais appelé `structured_output`) et ses deux causes probables (outil refusé via les permissions / schéma insatisfiable) afin que le repli à l'exécution dispose de diagnostics visibles par l'utilisateur.

## Exécution : répartition des tours

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
gère la répartition à l'exécution. Les spécificités de `structured_output` :

### Pré-analyse + suppression des outils frères

Quand le modèle émet `structured_output` en même temps que d'autres outils dans le même tour d'assistant, l'appel synthétique est le contrat terminal. La pré-analyse dans `processToolCallBatch` filtre `requestsToExecute` pour ne garder que les appels à `structured_output`, de sorte que les outils frères ayant des effets de bord (`write_file`, `run_shell_command`, `edit`, …) ne s'exécutent jamais.

Exemples de lots (quand `--json-schema` est actif) :

| Modèle émet                                              | Comportement                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                  | `write_file` est ignoré. `structured_output` valide, l'exécution se termine.                                                                                                                                                                                                                                                |
| `[structured_output(bad-args), structured_output(good)]` | Le premier échoue la validation Ajv ; le second réussit. L'exécution se termine avec les arguments du second appel.                                                                                                                                                                                                                               |
| `[structured_output(bad-args), write_file(…)]`           | `structured_output(bad)` échoue. `write_file` est également ignoré (supprimé dès le départ). Le modèle voit les deux : le message d'erreur d'Ajv pour l'appel structuré, et un `tool_result` synthétisé `"Skipped: …"` pour l'appel à effet de bord. Au tour suivant, le modèle peut réémettre les deux ou corriger uniquement l'appel structuré. |
| `[other_tool_a, other_tool_b]` (pas de `structured_output`)  | La pré-analyse est inactive. Les deux outils s'exécutent normalement ; l'exécution ne se termine PAS.                                                                                                                                                                                                                                          |

Le corps synthétisé `"Skipped:"` a deux variantes :

- **Chemin de réussite** (un appel structuré a capturé le contrat ce tour-ci) : `"Skipped: this turn's structured_output contract took precedence as the terminal output."` — court, car la session se termine immédiatement et aucun consommateur (modèle ou SDK) n'agit dessus.
- **Chemin de nouvelle tentative** (aucun appel structuré capturé, le modèle obtient un autre tour) : ajoute `"Re-issue this call in a separate turn if needed."` — c'est le seul cas actionnable par le modèle.

### Parité entre tour principal et tour de vidage

`processToolCallBatch(batchRequests, setModelOverride)` est définie à l'intérieur de `runNonInteractive` et appelée depuis :

- La boucle de tour principal (en haut de la fonction).
- `drainOneItem` (boucle de réponse aux notifications cron-prompt / tâches de fond).

Le tour de vidage est important car `structured_output` est enregistré pour toute la session, donc un job cron ou une réponse à notification POURRAIT aussi déclencher l'outil. L'assistant traite les deux points d'appel de manière identique au moment de l'invocation ; la seule liaison spécifique au point d'appel est quelle variable `modelOverride` écrire — passée via un setter.

Le **flux de terminaison post-assistant** diffère entre les deux sites : le chemin du tour principal appelle directement `return emitStructuredSuccess()`, tandis que le chemin du tour de vidage nécessite une terminaison en deux temps (`processToolCallBatch` capture le résultat dans `structuredSubmission` (portée de fermeture) ; `drainLocalQueue` le vérifie pour arrêter la boucle de vidage, puis la boucle de retenue le vérifie pour sortir et appeler `emitStructuredSuccess`). Les deux convergent vers le même bloc terminal, mais l'indirection supplémentaire dans le chemin de vidage est essentielle — sans elle, la boucle de vidage continuerait à traiter les éléments en file après la capture du résultat structuré.
### Bloc de succès structuré (terminal)

`emitStructuredSuccess()` (également définie dans `runNonInteractive`) est
le chemin partagé « nous avons un appel valide, arrêtons-nous » :

1. `registry.abortAll()` interrompt les agents en arrière-plan en cours — le
   contrat de sortie structurée est à usage unique et ne doit pas entrer en
   concurrence avec `task_notification` dans l'émission terminale.
2. Maintien temporaire limité (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms) afin
   que les gestionnaires d'annulation naturels des agents qui viennent d'être interrompus aient une chance
   d'émettre leur `task_notification` terminale et de la déposer dans
   `localQueue`. La condition de boucle est
   `Date.now() < deadline && registry.hasUnfinalizedTasks()`, donc l'attente
   se termine immédiatement lorsque rien n'est en vol (chemin typique)
   et ne bloque jamais plus que la limite. Le plafond de 500 ms est
   au mieux — des événements `task_started` orphelins restent possibles sous
   charge si un gestionnaire d'annulation particulier dépasse le budget.
   La boucle **ne** surveille **pas** le signal d'abandon : un SIGINT reçu
   pendant le maintien ou pendant le chemin d'émission qui suit ne
   court-circuitera pas le résultat déjà capturé. Sans
   le maintien, les consommateurs de flux json verraient régulièrement des événements `task_started`
   sans `task_notification` correspondante.
3. `flushQueuedNotificationsToSdk(localQueue)` vide tout ce qui est encore
   en file d'attente.
4. `finalizeOneShotMonitors()` (idempotent — appelable deux fois sans danger ; le
   chemin de vidage-tour l'a déjà invoquée).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Chemins d'échec

| Cause                                                             | Code de sortie                | Surface                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le modèle émet uniquement du texte brut                           | 1                             | Erreur avec nombre de tours + « Aperçu du résultat » tronqué.                                                                                                                                                                                                                                |
| Le modèle n'appelle jamais `structured_output` pendant `maxSessionTurns` tours | 53                            | « Nombre maximal de tours de session atteint » + indice `--json-schema` pointant vers le symptôme courant de blocage et ses deux causes probables.                                                                                                                                                             |
| La validation échoue à plusieurs reprises                         | (finalement 53 via max-turns) | Chaque échec est communiqué au modèle au tour suivant avec le message Ajv.                                                                                                                                                                                                          |
| Abandon / SIGINT                                                  | 130                           | Chemin d'annulation. Un résultat structuré n'est normalement pas émis, mais la boucle de maintien de `emitStructuredSuccess()` ne surveille pas le signal d'abandon — un SIGINT qui arrive après la capture mais avant/pendant l'émission sur stdout peut encore vider le résultat. Le code de sortie est le signal fiable. |

## Enveloppe de sortie

Le pipeline de l'adaptateur dans
[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
traite la présence de `structuredResult` (suivie via `'structuredResult' in options`,
pas `!== undefined`, donc le contrat est préservé même lorsque le modèle
appelle `structured_output` sans arguments sous un schéma vide) :

- `result` est forcé à `JSON.stringify(payload)` — remplaçant tout
  résumé en texte libre accumulé par l'adaptateur.
- Un champ de premier niveau `structured_result` porte l'objet brut pour
  les consommateurs qui ne veulent pas ré-analyser la forme sérialisée.
- Les `payload` non définis sont normalisés à `null` (rendu sous la forme du littéral JSON
  `null` dans les deux champs) afin que le champ ne puisse pas disparaître silencieusement.
  En pratique, ce repli est rarement atteint : en amont, `turn.ts`
  applique `(fnCall.args || {})` avant de stocker la soumission, donc un
  appel sans argument sur un schéma vide atterrit comme `{}` et est rendu comme
  `{}` sur stdout, pas `null`. L'étape `?? null` est une défense en profondeur
  pour le cas strictement indéfini.

Le mode TEXT écrit uniquement le champ `result` suivi d'une nouvelle ligne sur stdout (toute
prose d'assistant incidente accumulée durant l'exécution est ignorée —
non répercutée sur stderr). Le mode JSON émet le journal complet des événements sous forme de
tableau JSON ; `structured_result` se trouve sur le dernier élément de type `"result"`
de ce tableau, pas à la racine du document. Le mode stream-json
émet chaque message sur sa propre ligne au format JSONL ; la ligne `result` de fin
porte `structured_result`.
## Vie privée : masquage inter-surfaces

Les arguments soumis via `structured_output` SONT la charge utile structurée. En cas de succès, ils se trouvent déjà sur stdout ; en cas d'échec de validation et de tentatives ultérieures, ils peuvent ne jamais atteindre stdout. Quoi qu'il en soit, les persister sur des surfaces durables sur l'appareil (ou les exporter hors de l'appareil via la télémétrie) constitue une duplication qui divulgue la charge utile dans un stockage à plus longue durée de vie que ce que l'utilisateur a demandé. La règle de masquage est donc « ne jamais persister aucun argument de cet outil synthétique, quel que soit le résultat », et pas seulement « dédupliquer ce qui est déjà sur stdout ».

Deux surfaces doivent appliquer le masquage, et elles partagent la même constante de substitution [`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts) :

- `ToolCallEvent.function_args` (télémétrie) — couvre les exportations OTLP, QwenLogger, ui-telemetry, et le miroir d'événements UI de l'enregistrement de chat.
- `redactStructuredOutputArgsForRecording` (utilisé par `recordAssistantTurn` dans `geminiChat.ts`) — couvre le JSONL d'enregistrement de chat sur disque à `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`. Les tentatives d'échec de validation atterrissent également ici — les arguments de chaque tentative reçoivent le même substitut.

La constante partagée empêche toute dérive entre les deux surfaces. Les métriques d'appel d'outil (durée, succès, décision) sont préservées.

Les hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) ne sont intentionnellement **pas** masqués — ils reçoivent le `tool_input` brut car le contrat du hook est « voir ce que l'outil voit ». Cela est documenté dans la section Vie privée de la documentation utilisateur comme un avertissement « Les hooks voient les arguments bruts » afin que les opérateurs puissent filtrer sur `tool_name` ou ajouter un masquage côté hook avant d'exécuter `--json-schema` sur des données sensibles.

Le masquage est intentionnellement limité aux surfaces de persistance **sur l'appareil** (exportations télémétriques + JSONL d'enregistrement de chat). Le schéma lui-même voyage toujours vers le fournisseur de modèle à chaque requête dans le bloc `parameters` de la déclaration de fonction `structured_output` — aucun masquage côté fournisseur n'est possible, car le modèle a besoin du schéma pour remplir le contrat d'appel d'outil. La section Vie privée de la documentation utilisateur avertit les utilisateurs de garder les charges utiles `enum` / `const` / `default` / `examples` / `description` exemptes de secrets pour la même raison.

## Contrôle des autorisations

`structured_output` est délibérément exclu de `PermissionManager.CORE_TOOLS` (l'ensemble des outils soumis à la vérification de la liste blanche `--core-tools`) — aux côtés des autres outils synthétiques (`agent`, `exit_plan_mode`, `ask_user_question`, `task_stop`, `send_message`). Les outils découverts dynamiquement (`skill`, MCP) constituent une catégorie d'exclusion distincte qui contourne également la liste blanche pour des raisons non liées. L'outil synthétique n'existe que lorsque `--json-schema` est défini ; l'ajouter au mécanisme de liste blanche signifierait que `--core-tools read_file --json-schema X` supprime silencieusement le contrat terminal.

Les règles explicites `permissions.deny` et les paramètres `--exclude-tools` s'appliquent toujours via `PermissionManager.evaluate` → `isToolEnabled`. Les deux utilisent le même mécanisme de refus et empêchent l'enregistrement — la déclaration de l'outil est retirée du registre, donc le modèle ne voit jamais l'outil. Le résultat typique est que le modèle répond en texte brut (exit 1). Si le modèle parcourt d'autres outils sans produire de texte, il finit par atteindre `maxSessionTurns` (exit 53) et l'indice `--json-schema` dans `handleMaxTurnsExceededError` indique à l'utilisateur où chercher.

**Interaction avec `--bare`.** Le mode bare court-circuite le pont de configuration paramètres → CLI : `packages/cli/src/config/config.ts` construit `mergedDeny` comme `[...(bareMode ? [] : settings.permissions.deny), ...]`, donc les refus au niveau des paramètres (et `tools.exclude`) sont ignorés sous `--bare`. Les `--exclude-tools` au niveau des arguments sont inconditionnellement ajoutés à `mergedDeny`, donc ils s'appliquent toujours. L'outil synthétique est enregistré indépendamment de tout cela (piloté par `jsonSchema`, pas par la liste de refus), donc un refus uniquement basé sur les paramètres de `structured_output` devient silencieusement inopérant sous `--bare` tandis que l'outil reste appelable.

## Contextes de sous-agent

`Config.createToolRegistry` accepte une option `forSubAgent: true` qui supprime l'enregistrement synthétique. Les surcharges de sous-agent réutilisent la configuration parent via la délégation de prototype (`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`), et `this.jsonSchema` se propage à travers la chaîne de prototypes. Sans ce drapeau, l'outil synthétique s'enregistrerait également dans le registre du sous-agent, et un sous-agent l'appelant recevrait le llmContent « session ends now » — mais seules les boucles principale / de drain de `runNonInteractive` détectent cela comme terminal, donc le sous-agent continuerait à s'exécuter et brûlerait des tokens sur un outil dont son contrat de boucle ne peut honorer.

> **Note au mainteneur.** Cette suppression repose sur le seul chemin d'appel via `createToolRegistry(forSubAgent: true)`. Tout futur mécanisme de création de sous-agent qui contourne ce chemin divulguera l'outil synthétique dans le registre du sous-agent et réintroduira le mode de défaillance de brûlage de tokens à l'infini. Le complément de sécurité serait une garde à l'exécution dans `syntheticOutput.execute()` qui renvoie une `fatalError` (ou une opération nulle) lorsqu'elle est invoquée depuis un contexte de sous-agent. Implémentez-en un si un deuxième chemin de fuite apparaît.
## Protection de l'outil fantôme MCP

`tool-registry.ts:registerTool` vérifie les collisions de noms dans la carte `factories` (paresseuse), pas seulement dans la carte `tools` (active). Si un serveur MCP découvre un outil littéralement nommé `structured_output`, le chemin d'auto-qualification qui existe pour les collisions d'outils actifs se déclenche aussi pour les collisions de fabriques : l'outil MCP est renommé en `mcp__<server>__structured_output` et la fabrique synthétique conserve le nom nu. Sans cette protection, un serveur MCP pourrait détourner silencieusement le contrat de sortie structurée.

## Surface de compatibilité

| Combinaison                                              | Statut                 | Justification                                                                                                                                 |
| -------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (ou stdin, ou positionnel)        | Prise en charge        | Chemin principal sans tête.                                                                                                                   |
| `--json-schema` + `--output-format text` (par défaut)    | Prise en charge        | `JSON.stringify(payload)` + saut de ligne.                                                                                                    |
| `--json-schema` + `--output-format json` / `stream-json` | Prise en charge        | Le champ `structured_result` contient l'objet brut.                                                                                           |
| `--json-schema` + `--bare`                               | Prise en charge        | `--bare` restreint le registre à `read_file`, `edit`, `run_shell_command` ; l'outil synthétique est enregistré aux côtés de cet ensemble minimal. |
| `--json-schema` + `-i`                                   | Rejeté lors de l'analyse| L'interface TUI n'a pas de contrat terminal pour l'outil synthétique.                                                                          |
| `--json-schema` + `--input-format stream-json`           | Rejeté lors de l'analyse| Contrat unique vs protocole longue durée.                                                                                                     |
| `--json-schema` + `--acp` / `--experimental-acp`         | Rejeté lors de l'analyse| La boucle ACP est indépendante.                                                                                                               |
| `--json-schema` + `--prompt-interactive`                 | Rejeté lors de l'analyse| Identique à `-i`.                                                                                                                             |
| `--json-schema` + aucune invite + aucun stdin redirigé   | Rejeté lors de l'analyse| Le mode sans tête nécessite une invite.                                                                                                       |

## Alternatives envisagées

**Invite de réponse consciente du schéma (sans outil synthétique).** Demander au modèle de « répondre avec du JSON correspondant à ce schéma » via l'invite système et analyser le message final de l'assistant. Rejetée car le modèle n'a aucune garantie syntaxique — la sortie pourrait être délimitée, précédée de bavardage, ou halluciner des champs. La validation des appels d'outils est appliquée par la couche d'appel de fonction avant `execute()`, ce qui nous donne une garde syntaxique et sémantique stricte.

**`response_format: {type: "json_schema", …}` d'OpenAI.** Spécifique au fournisseur ; nécessiterait des implémentations parallèles pour Gemini et Anthropic. L'approche par outil synthétique est indépendante du fournisseur.

**Réordonner structured_output au début du lot au lieu de filtrer.** Permet aux effets de bord frères de s'exécuter si l'appel structuré échoue à la validation. Rejetée car le contrat de `--json-schema` est « produire une sortie structurée » — si le modèle est dans ce mode, les effets de bord frères sont probablement une erreur. Les supprimer complètement est plus sûr ; le modèle voit un `tool_result` « Ignoré : » et peut les réémettre dans un tour séparé.

**Résolution locale des `$ref` dans `schemaRootAcceptsObject`.** Attraperait les schémas comme `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` au moment de l'analyse. Rejetée pour l'instant car le coût (détection de cycles, syntaxe JSON Pointer, `$defs` vs `definitions`, pointeurs partiels, références distantes) dépasse le bénéfice ; l'indication `maxSessionTurns` dirige déjà les utilisateurs vers « le schéma est insatisfaisable » comme cause probable.

## Travaux en cours

- La validation de réponse consciente du schéma pourrait intégrer une protection ReDoS basée sur les motifs si des utilisateurs réels rencontrent des motifs à backtracking catastrophique dans les arguments `--json-schema`.
- Ajouts au protocole SDK (SDK Python / TypeScript / Java exposant un champ `structured_result` typé) — à suivre séparément ;
  [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (fermée non fusionnée le 11/05/2026) couvrait ce périmètre avant que le travail sur cli/core ne soit livré et a été remplacée.
## Index des fichiers

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`,
  `schemaRootAcceptsObject`, règles de mutex `.check` de yargs.
- `packages/cli/src/gemini.tsx` — Garde de l’interface TUI, gestion des codes de sortie.
- `packages/cli/src/nonInteractiveCli.ts` —
  `processToolCallBatch`, `emitStructuredSuccess`,
  `suppressedOutputBody`, chemin d’échec en texte brut.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` —
  Enveloppe `structuredResult` → `result` + `structured_result`.
- `packages/core/src/config/config.ts` — Enregistrement avec
  `registerStructuredOutputIfRequested`, saut pour `forSubAgent`.
- `packages/core/src/tools/syntheticOutput.ts` — Outil synthétique +
  espace réservé `STRUCTURED_OUTPUT_REDACTED_ARGS`.
- `packages/core/src/tools/tool-registry.ts` — Renommage par collision
  d’usine pour les outils d’ombre MCP.
- `packages/core/src/telemetry/types.ts` — Masquage de `function_args`.
- `packages/core/src/core/geminiChat.ts` —
  `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict`
  avec une instance Ajv stricte.
- `packages/cli/src/utils/errors.ts` —
  Indication `--json-schema` dans `handleMaxTurnsExceededError`.

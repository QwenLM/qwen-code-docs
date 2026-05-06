# Conception des résumés d'utilisation d'outils

> Étiquettes de modèle rapide pour les lots d'outils parallèles — motivation, analyse concurrentielle avec Claude Code, architecture et justification du mode append-only de `<Static>` qui a conduit au rendu actuel en mode complet.
>
> Documentation utilisateur : [Tool-Use Summaries](../../users/features/tool-use-summaries.md).

## 1. Synthèse

Une fois chaque lot d'outils terminé, Qwen Code lance une courte requête vers un modèle rapide qui renvoie une étiquette résumant le lot, au format d'un sujet de commit Git. L'étiquette s'affiche sous forme d'une ligne discrète `● <label>` en mode complet et remplace l'en-tête générique `Tool × N` en mode compact. La génération s'exécute en mode fire-and-forget en parallèle du flux API du tour suivant, ce qui masque sa latence d'environ 1 s derrière le streaming du modèle principal.

| Dimension             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Point de déclenchement         | `query.ts` — après la finalisation d'un lot d'outils                             | `useGeminiStream.ts` → `handleCompletedTools` — même point du cycle de vie                       |
| Modèle de génération      | Haiku via `queryHaiku`                                                | `fastModel` configuré via `GeminiClient.generateContent`                                  |
| Comportement des sous-agents     | `!toolUseContext.agentId` — session principale uniquement                         | Implicite — les sous-agents s'exécutent via `agents/runtime/`, pas `useGeminiStream`                  |
| Planification            | Fire-and-forget, await juste avant l'émission du flux du tour suivant    | Fire-and-forget, ajouté à l'historique une fois résolu                                         |
| Format de sortie          | `ToolUseSummaryMessage` injecté dans le flux SDK                   | `HistoryItemToolUseSummary` ajouté à l'historique UI + factory exportée pour une future utilisation SDK      |
| Feature gate                  | Variable d'env `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`, par défaut **désactivée**            | Paramètre `experimental.emitToolUseSummaries` (par défaut **activé**) + override env                |
| Consommateur principal      | Clients Mobile / SDK                                                  | Mode compact CLI + mode complet, futur SDK                                                   |
| Prompt                | Sujet de commit Git, temps passé, nom le plus distinctif (portage verbatim) | Prompt système identique                                                                    |
| Troncature des entrées      | 300 caractères par champ d'outil via `truncateJson`                           | Identique                                                                                  |
| Préfixe d'intention         | 200 premiers caractères du dernier message de l'assistant                       | Identique                                                                                  |
| Mise en cache du prompt        | `enablePromptCaching: true` sur l'appel Haiku                         | Pas encore câblé (route `forkedAgent` disponible ; identifiée comme optimisation future)               |
| Post-traitement de l'étiquette | Texte brut du modèle                                                        | `cleanSummary` (supprime markdown, guillemets, préfixes d'erreur ; plafonné à 100 caractères, limité contre ReDoS) |
| Persistance de session   | Flux uniquement ; chaque session régénère                                 | Historique UI uniquement ; `ChatRecordingService` ne persiste pas les entrées `tool_use_summary`        |

## 2. Analyse de l'implémentation de Claude Code

### 2.1 Flux

Claude Code exécute la boucle d'outils dans `query.ts`. Une fois un lot d'outils exécuté et ses résultats normalisés, la fonction génératrice lance un appel Haiku, conserve la promesse en attente sur `nextPendingToolUseSummary`, et poursuit avec l'appel API du tour suivant. La latence de Haiku (~1 s) se superpose au streaming du modèle principal (5 à 30 s), ce qui garantit une latence ajoutée nulle pour l'utilisateur. Juste avant d'émettre le contenu du tour suivant, le générateur attend le résumé en attente et injecte un message `tool_use_summary` dans le flux.

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← summary Promise resolves during streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue with next turn
```

### 2.2 Fichiers sources clés

| Composant       | Fichier                                                       | Logique clé                                                                               |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Générateur       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| Déclencheur         | `query.ts:1411-1482`                                       | Gardé par la condition `emitToolUseSummaries` + exclusion sous-agents ; fork Haiku ; propagation de la promesse           |
| Await + émission    | `query.ts:1055-1060`                                       | Await `pendingToolUseSummary` à la limite du tour suivant, émission du message                      |
| Factory de message | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| Feature gate    | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 Décisions de conception

1. **Générer systématiquement lorsque la condition est activée, quel que soit l'état compact/détaillé.** Le résumé est un artefact au niveau du flux ; l'UI décide de son rendu.
2. **Émettre comme un type de message de première classe.** `tool_use_summary` coexiste avec `user`, `assistant`, `tool_result` dans le flux SDK, avec un champ `precedingToolUseIds` permettant aux consommateurs de le corréler au lot.
3. **Exclusion des sous-agents.** `!toolUseContext.agentId` — la sortie des sous-agents est agrégée en amont ; les lots individuels de sous-agents généreraient des étiquettes bruyantes qui n'apparaissent jamais dans l'UI principale.
4. **Désactivé par défaut.** La condition basée sur l'env maintient le coût à zéro sauf si un consommateur SDK en aval l'active explicitement. Le terminal CC lui-même n'affiche pas le message.
5. **Troncature des entrées à 300 caractères par champ.** Couvre le risque de coût dominant — un seul résultat d'outil volumineux qui ferait exploser le prompt — tout en conservant suffisamment de signal pour l'étiquette.

## 3. Implémentation dans Qwen Code

### 3.1 Flux

Qwen Code s'attache au même point du cycle de vie (`useGeminiStream.handleCompletedTools`) mais effectue le rendu des deux côtés de `ui.compactMode`, rendant la fonctionnalité utile aux utilisateurs CLI sans nécessiter de plumbing SDK.

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() for next turn (streaming starts)
           ↓
   ← summary Promise resolves during streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay renders:
    compactMode=false → ● <label> standalone line
    compactMode=true  → hidden; MainContent lookup injects into CompactToolGroupDisplay header
```

### 3.2 Fichiers sources clés

| Composant           | Fichier                                                                  | Logique clé                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Service             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, factory de message |
| Condition d'activation         | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | Override env → paramètres → défaut (true)                                  |
| Déclencheur             | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | Lance l'appel au modèle rapide, `addItem` à la résolution                                 |
| Rendu mode complet    | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Affiche la ligne `● <label>` quand `!compactMode`                              |
| Recherche mode compact | `packages/cli/src/ui/components/MainContent.tsx`                      | Map `summaryByCallId` → prop `compactLabel` pour chaque `tool_group`            |
| En-tête compact      | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Remplace `Tool × N` par défaut par `<Summary> · N tools` si étiquette présente |
| Gestion des fusions      | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | Traite `tool_use_summary` comme masqué en mode compact pour l'adjacence              |
| Type UI             | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 Contrainte append-only de `<Static>`

La décision architecturale centrale de cette PR est **la raison pour laquelle l'étiquette en mode complet est un élément d'historique autonome et non une décoration sur le `tool_group` lui-même**.

Qwen Code rend la transcription via `<Static>` d'Ink. Static est append-only : une fois un élément validé dans le tampon du terminal, Ink ne repeindra pas cette région sauf si `refreshStatic()` est appelé pour effacer et rendre à nouveau toute la transcription. C'est le modèle de performance sur lequel le CLI repose — les éléments statiques ne sont pas rendus à chaque frappe.

Considérons maintenant le timing de l'appel au modèle rapide :

```
T0   tool batch completes, tool_group is pushed to history
T0+ε tool_group renders through <Static> and is committed to the buffer
T0+1s fast-model call resolves with a label
```

À T0+1s, nous ne pouvons pas rétroactivement ajouter l'étiquette au `tool_group` déjà validé. Deux options existent :

1. **Mettre à jour les props du `tool_group` + appeler `refreshStatic()`.** Fonctionne, mais provoque un repeint complet de la transcription à chaque lot — l'une des opérations UI les plus coûteuses de l'application. Flash visible. Inacceptable pour une étiquette cosmétique.
2. **Rendre le résumé comme un nouvel élément d'historique ajouté _après_ le `tool_group`.** Static gère cela nativement — les nouveaux éléments s'ajoutent proprement, sans repeint.

Cette PR retient l'option 2 en mode complet. L'entrée `tool_use_summary` est un véritable élément d'historique, rendu sous forme d'une ligne discrète `● <label>` par `HistoryItemDisplay`. Aucun `refreshStatic` nécessaire.

Le mode compact est différent à cause de `mergeCompactToolGroups`. Lorsque des `tool_group` consécutifs fusionnent, `MainContent` appelle déjà `refreshStatic()` — c'est un chemin de code existant, et il rend à nouveau le groupe fusionné avec l'étiquette récupérée depuis l'historique. Ainsi, le mode compact \_obtient bien* l'étiquette comme remplacement d'en-tête. Pour éviter d'afficher la même étiquette deux fois (une fois comme en-tête compact, une fois comme ligne `● <label>` traînante), `HistoryItemDisplay` masque la ligne autonome quand `compactMode` est à `true`.

```
Full mode              Compact mode (with merge)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — header replaced via lookup]
● <label>              (● <label> line is hidden)
```

### 3.4 Sémantique de la condition d'activation

Trois couches, résolues par ordre de priorité :

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — override env, priorité la plus haute.
2. `experimental.emitToolUseSummaries` dans `settings.json` — défaut `true`.
3. Saut implicite — si `config.getFastModel()` renvoie `undefined`, la génération est ignorée quelle que soit la condition. Aucune erreur, aucun changement visible pour l'utilisateur.

### 3.5 Nettoyage de la sortie

`cleanSummary` s'exécute sur chaque réponse du modèle avant son ajout à l'historique :

1. Ne conserve que la première ligne (supprime les préambules de raisonnement du modèle).
2. Supprime les préfixes de liste (`-`, `*`, `•`) — les modèles renvoient parfois l'étiquette sous forme d'élément de liste.
3. Supprime les guillemets/backticks environnants via une regex bornée `{1,10}` (sécurisé CodeQL ; aucune étiquette réelle n'a plus d'une poignée de guillemets englobants).
4. Supprime les préfixes d'étiquette (`Label:`, `Summary:`, `Result:`, `Output:`) que certains modèles ajoutent.
5. Rejette les formes de message d'erreur (`API error: ...`, `Error: ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) — renvoie une chaîne vide pour qu'aucun élément d'historique ne soit ajouté.
6. Plafonnement strict à 100 caractères (l'UI mobile tronque vers 30 ; la marge couvre les phrases CJK).

### 3.6 Télémétrie

L'appel de génération de résumé définit `promptId: 'tool_use_summary_generation'` afin que son utilisation de tokens soit comptabilisée séparément dans `/stats`. Cela permet aux utilisateurs de voir le coût incrémental exact de la fonctionnalité sans le confondre avec les suggestions de prompt ou l'utilisation de la session principale.

## 4. Écarts par rapport à Claude Code (et pourquoi)

| Écart                                                                | Pourquoi                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Couche de paramètres en plus de la condition env                                   | Qwen Code affiche l'étiquette dans le CLI ; les utilisateurs ont besoin d'un interrupteur persistant, pas d'un export env par shell.                                                                                     |
| **Activé** par défaut au lieu de désactivé                                            | L'étiquette est immédiatement visible dans les deux modes d'affichage ; les utilisateurs qui configurent `fastModel` optent déjà pour les fonctionnalités de modèle rapide.                                                     |
| Post-traitement `cleanSummary` dédié                                 | Qwen Code prend en charge des fournisseurs plus hétérogènes que CC ; certains modèles ajoutent `Label:` ou entourent de guillemets. La normalisation à la frontière maintient la cohérence de l'UI.                           |
| Stocke `HistoryItemToolUseSummary` au lieu d'émettre un message de flux | Implémentation CLI-first ; la route flux SDK fera l'objet d'une future PR. La factory `ToolUseSummaryMessage` est déjà exportée pour ce travail.                                                   |
| Mise en cache du prompt pas encore câblée                                             | Le modèle rapide est souvent le même que le modèle principal pour les utilisateurs n'ayant pas configuré de modèle distinct. Ajouter le partage de cache nécessite un routage via `forkedAgent.ts` ; suivi comme tâche ultérieure. |
| Doubles chemins de rendu (inline mode complet + en-tête mode compact)               | La valeur par défaut de Qwen Code est `ui.compactMode: false` ; sans le rendu inline en mode complet, la fonctionnalité serait invisible pour la plupart des utilisateurs.                                                      |

## 5. Limites connues

- **Pas de persistance de session.** `tool_use_summary` n'est pas écrit dans le JSONL d'enregistrement du chat. La reprise d'une session entraîne la perte des étiquettes ; les groupes d'outils s'affichent avec l'en-tête générique par défaut. Priorité faible : les étiquettes se régénèrent naturellement à mesure que l'utilisateur poursuit la session.
- **Pas d'émission de flux SDK pour le moment.** La factory de message est exportée, mais le CLI n'injecte pas encore `tool_use_summary` dans le pont SDK. PR de suivi.
- **Pas de mise en cache du prompt.** Chaque lot entraîne un coût en tokens d'entrée frais. Négligeable en valeur absolue (~300 tokens) mais mesurable si vous exécutez des dizaines de lots par tour.
- **Le résumé pour les groupes compacts fusionnés sélectionne l'étiquette du premier lot contribuant.** Si un utilisateur lance dix lots dissimilaires à la suite (boucle serrée, non typique), l'en-tête compact fusionné n'affichera que l'intention du lot principal. Compromis accepté : diffuser les étiquettes par lot dans une vue fusionnée est visuellement plus bruyant que de prendre la première.
- **Modèle rapide requis.** Sans `fastModel` configuré, la génération est ignorée. Le fallback vers le modèle principal est délibérément interdit pour maintenir un profil de coût maîtrisé.

## 6. Travaux futurs

1. Câbler `ToolUseSummaryMessage` dans le pont SDK afin que la factory existante soit utilisée en aval.
2. Router la génération via `forkedAgent.ts` avec `enablePromptCaching` pour que les préfixes de noms d'outils répétés touchent les caches des fournisseurs.
3. Optionnel : persister les entrées `tool_use_summary` dans `ChatRecordingService` et les rejouer à la reprise de session.
4. Optionnel : raccourcis d'étiquettes par nom d'outil (ex. toujours `Read <filename>` pour un appel unique `read_file`) comme chemin rapide pré-LLM.
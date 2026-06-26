# Résumé de la conception des résumés d'utilisation d'outils

> Étiquettes fast-model pour les lots d'outils parallèles — motivation, analyse concurrentielle avec Claude Code, architecture et la logique d'« append-only Static » qui a conduit au rendu en mode complet actuel.
>
> Documentation utilisateur : [Tool-Use Summaries](../../users/features/tool-use-summaries.md).

## 1. Résumé exécutif

Après chaque lot d'outils terminé, Qwen Code déclenche un court appel fast-model qui renvoie une étiquette de style git-commit-subject résumant le lot. L'étiquette s'affiche sous la forme d'une ligne atténuée `● <label>` en mode complet et remplace le titre générique `Tool × N` en mode compact. La génération s'exécute en fire-and-forget en parallèle du flux API du tour suivant, de sorte que sa latence d'environ 1 s est masquée par le streaming du modèle principal.

| Dimension                   | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Point de déclenchement      | `query.ts` — après finalisation d'un lot d'outils                     | `useGeminiStream.ts` → `handleCompletedTools` — même point du cycle de vie                |
| Modèle de génération        | Haiku via `queryHaiku`                                                | `fastModel` configuré via `GeminiClient.generateContent`                                   |
| Comportement sous-agent     | `!toolUseContext.agentId` — session principale uniquement             | Implicite — les sous-agents passent par `agents/runtime/`, pas par `useGeminiStream`       |
| Ordonnancement              | Fire-and-forget, attendu juste avant l'émission du flux du tour suivant | Fire-and-forget, ajouté à l'historique une fois résolu                                     |
| Forme de sortie             | `ToolUseSummaryMessage` produit dans le flux SDK                      | `HistoryItemToolUseSummary` ajouté à l'historique UI + factory exportée pour utilisation SDK future |
| Activation                  | Variable d'env `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`, désactivée par défaut | Paramètre `experimental.emitToolUseSummaries` (activé par défaut) + surcharge par variable d'env |
| Principal consommateur      | Clients mobiles / SDK                                                 | Mode compact CLI + mode complet, SDK futur                                                   |
| Prompt                      | Git-commit-subject, passé composé, nom le plus distinctif (porté textuellement) | Prompt système identique                                                                    |
| Troncature d'entrée         | 300 caractères par champ d'outil via `truncateJson`                   | Identique                                                                                  |
| Préfixe d'intention         | 200 premiers caractères du dernier message de l'assistant             | Identique                                                                                  |
| Mise en cache du prompt     | `enablePromptCaching: true` sur l'appel Haiku                         | Pas encore branché (route via agent forké disponible ; signalé comme optimisation future)  |
| Post-traitement de l'étiquette | Texte brut du modèle                                                | `cleanSummary` (supprime le markdown, les guillemets, les préfixes d'erreur ; limite à 100 caractères, limité aux attaques ReDoS) |
| Persistance de session      | Flux uniquement ; chaque session régénère                             | Historique UI uniquement ; `ChatRecordingService` ne persiste pas les entrées `tool_use_summary` |

## 2. Analyse de l'implémentation de Claude Code

### 2.1 Flux

Claude Code exécute la boucle d'outils dans `query.ts`. Après l'exécution d'un lot d'outils et la normalisation de ses résultats, la fonction génératrice bifurque sur un appel Haiku, conserve la promesse en attente dans `nextPendingToolUseSummary`, et continue avec l'appel API du tour suivant. La latence Haiku (~1 s) se superpose au streaming du modèle principal (5–30 s), de sorte que l'utilisateur ne perçoit aucune latence supplémentaire. Juste avant d'émettre le contenu du tour suivant, la génératrice attend la promesse en attente et produit un message `tool_use_summary` dans le flux.

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← la promesse summary se résout pendant le streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue avec le tour suivant
```

### 2.2 Fichiers sources clés

| Composant       | Fichier                                                       | Logique clé                                                                               |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Générateur       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| Déclencheur      | `query.ts:1411-1482`                                       | Protection par la porte `emitToolUseSummaries` + pas de sous-agent ; bifurcation Haiku ; conservation de la promesse |
| Attente + émission | `query.ts:1055-1060`                                       | Attente de `pendingToolUseSummary` à la limite du tour suivant, émission du message      |
| Fabrique de messages | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| Porte de fonctionnalité | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 Décisions de conception

1. **Toujours générer lorsque la porte est activée, quel que soit l'état compact/détaillé.** Le résumé est un artefact au niveau du flux ; l'interface décide de l'afficher ou non.
2. **Émettre comme un type de message de première classe.** `tool_use_summary` se place aux côtés de `user`, `assistant`, `tool_result` dans le flux SDK avec un champ `precedingToolUseIds` permettant aux consommateurs de le corréler au lot.
3. **Exclusion des sous-agents.** `!toolUseContext.agentId` — la sortie des sous-agents est agrégée en amont ; les lots individuels de sous-agents produiraient des étiquettes bruyantes qui n'apparaissent jamais dans l'interface principale.
4. **Désactivé par défaut.** La porte exclusivement basée sur l'environnement maintient le coût à zéro sauf si un consommateur SDK aval choisit de l'activer. Le terminal CC lui-même n'affiche pas le message.
5. **Troncature d'entrée à 300 caractères par champ.** Couvre le risque de coût dominant — un résultat d'outil volumineux gonflant le prompt — tout en conservant suffisamment de signal pour l'étiquette.

## 3. Implémentation Qwen Code

### 3.1 Flux

Qwen Code s'accroche au même point du cycle de vie (`useGeminiStream.handleCompletedTools`) mais effectue le rendu des deux côtés de `ui.compactMode`, de sorte que la fonctionnalité soit utile aux utilisateurs CLI sans nécessiter de plomberie SDK.

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() pour le tour suivant (le streaming démarre)
           ↓
   ← la promesse summary se résout pendant le streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay effectue le rendu :
    compactMode=false → ● <label> ligne autonome
    compactMode=true  → masqué ; MainContent effectue une recherche pour injecter dans l'en-tête CompactToolGroupDisplay
```

### 3.2 Fichiers sources clés

| Composant           | Fichier                                                                  | Logique clé                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Service             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, fabrique de messages |
| Porte de configuration | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | Surcharge par variable d'environnement → paramètres → valeur par défaut (true) |
| Déclencheur         | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | Déclenche l'appel fast-model, addItem lors de la résolution                   |
| Rendu mode complet  | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Affiche la ligne `● <label>` lorsque `!compactMode`                              |
| Recherche mode compact | `packages/cli/src/ui/components/MainContent.tsx`                      | Map `summaryByCallId` → prop `compactLabel` pour chaque groupe d'outils            |
| En-tête compact     | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Remplace le titre par défaut `Tool × N` par `<Summary> · N outils` lorsque l'étiquette est présente |
| Gestion des fusions | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | Traite `tool_use_summary` comme masqué en mode compact pour l'adjacence              |
| Type UI             | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 La contrainte d'ajout uniquement (append-only) de `<Static>`

La décision architecturale centrale de cette PR est **pourquoi l'étiquette en mode complet est un élément d'historique indépendant et non une décoration du groupe d'outils lui-même**.

Qwen Code effectue le rendu du transcript via `<Static>` d'Ink. Static est en ajout uniquement : une fois qu'un élément est validé dans le tampon du terminal, Ink ne repeindra pas cette région à moins que `refreshStatic()` ne soit appelé pour effacer et réafficher l'intégralité du transcript. C'est le modèle de performances dont dépend la CLI — les éléments statiques ne se réaffichent pas à chaque frappe.

Considérons maintenant le timing de l'appel fast-model :

```
T0   le lot d'outils se termine, le groupe d'outils est poussé dans l'historique
T0+ε le groupe d'outils est rendu via <Static> et validé dans le tampon
T0+1s l'appel fast-model se résout avec une étiquette
```

À T0+1s, nous ne pouvons pas ajouter rétroactivement l'étiquette au groupe d'outils déjà validé. Deux options existent :

1. **Mettre à jour les props du groupe d'outils + appeler `refreshStatic()`.** Fonctionne, mais provoque un réaffichage complet du transcript à chaque lot — l'une des opérations UI les plus coûteuses de l'application. Flash visible. Inacceptable pour une étiquette cosmétique.
2. **Afficher le résumé comme un nouvel élément d'historique _ajouté après_ le groupe d'outils.** Static gère cela nativement — les nouveaux éléments s'ajoutent proprement, sans réaffichage.

Cette PR adopte l'option 2 en mode complet. L'entrée `tool_use_summary` est un véritable élément d'historique, affiché sous la forme d'une ligne atténuée `● <label>` par `HistoryItemDisplay`. Aucun `refreshStatic` nécessaire.

Le mode compact est différent à cause de `mergeCompactToolGroups`. Lorsque des groupes d'outils consécutifs fusionnent, `MainContent` appelle déjà `refreshStatic()` — c'est un chemin de code existant, et il réaffiche le groupe fusionné avec l'étiquette recherchée dans l'historique. Ainsi, le mode compact _obtient_ l'étiquette comme remplacement d'en-tête. Pour éviter d'afficher deux fois la même étiquette (une fois comme en-tête compact, une fois comme ligne `● <label>` de fin), `HistoryItemDisplay` masque la ligne autonome lorsque `compactMode` est vrai.

```
Mode complet           Mode compact (avec fusion)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — en-tête remplacé via recherche]
● <label>              (ligne ● <label> masquée)
```

### 3.4 Sémantique de la porte

Trois couches, résolues par ordre de priorité :

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — surcharge par variable d'environnement, priorité la plus élevée.
2. `experimental.emitToolUseSummaries` dans `settings.json` — par défaut `true`.
3. Saut implicite — si `config.getFastModel()` renvoie `undefined`, la génération est ignorée quelle que soit la porte. Pas d'erreur, pas de modification visible pour l'utilisateur.

### 3.5 Nettoyage de la sortie

`cleanSummary` s'exécute sur chaque réponse du modèle avant qu'elle ne soit ajoutée à l'historique :

1. Ne prendre que la première ligne (supprime les préambules de raisonnement du modèle).
2. Supprimer les préfixes de puces (`-`, `*`, `•`) — les modèles renvoient parfois l'étiquette comme un élément de liste.
3. Supprimer les guillemets/backticks environnants via une expression régulière bornée `{1,10}` (sûre pour CodeQL ; aucune étiquette réelle n'a plus de quelques guillemets d'encapsulation).
4. Supprimer les étiquettes de préfixe (`Label :`, `Summary :`, `Result :`, `Output :`) que certains modèles ajoutent en préfixe.
5. Rejeter les formes de messages d'erreur (`API error : ...`, `Error : ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) — renvoie une chaîne vide, donc aucun élément d'historique n'est ajouté.
6. Limiter strictement la longueur à 100 caractères (l'interface mobile tronque autour de 30 ; la marge couvre les phrases en CJK).

### 3.6 Télémétrie

L'appel de génération du résumé définit `promptId: 'tool_use_summary_generation'`, de sorte que son utilisation des jetons soit comptabilisée séparément dans `/stats`. Cela permet aux utilisateurs de voir le coût supplémentaire exact de la fonctionnalité sans le confondre avec les suggestions de prompt ou l'utilisation de la session principale.

## 4. Écarts par rapport à Claude Code (et pourquoi)

| Écart                                                                  | Pourquoi                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Couche de paramètres en plus de la porte par variable d'environnement  | Qwen Code affiche l'étiquette dans la CLI ; les utilisateurs ont besoin d'un interrupteur persistant, pas d'un export env par shell.                                                                                     |
| Activé **par défaut** au lieu de désactivé                             | L'étiquette est immédiatement visible par l'utilisateur dans les deux modes d'affichage ; les utilisateurs qui configurent `fastModel` s'engagent déjà dans les fonctionnalités fast-model.                                                     |
| Post-traitement dédié `cleanSummary`                                   | Qwen Code prend en charge des fournisseurs plus hétérogènes que CC ; certains modèles ajoutent `Label :` ou encadrent de guillemets. La normalisation à la frontière maintient l'interface cohérente.                           |
| Stocke `HistoryItemToolUseSummary` plutôt que d'émettre un message de flux | Implémentation CLI d'abord ; la voie du flux SDK est une PR future. La fabrique `ToolUseSummaryMessage` est déjà exportée pour ce travail.                                                   |
| Mise en cache du prompt non encore branchée                            | Le modèle rapide est souvent le même que le modèle principal pour les utilisateurs qui n'en ont pas configuré de séparé. Ajouter le partage de cache nécessite un routage via `forkedAgent.ts` ; suivi comme amélioration ultérieure. |
| Doubles chemins de rendu (en ligne en mode complet + en-tête en mode compact) | La valeur par défaut de Qwen Code est `ui.compactMode : false` ; sans le rendu en ligne en mode complet, la fonctionnalité serait invisible pour la plupart des utilisateurs.                                                      |

## 5. Limitations connues

- **Absence de persistance de session.** `tool_use_summary` n'est pas écrit dans le JSONL de l'enregistrement de la conversation. La reprise d'une session entraîne la perte des étiquettes ; les groupes d'outils s'affichent avec le titre générique par défaut. Priorité faible : les étiquettes se régénèrent naturellement à mesure que l'utilisateur poursuit la session.
- **Pas encore d'émission dans le flux SDK.** La fabrique de messages est exportée, mais la CLI n'alimente pas encore `tool_use_summary` dans le pont SDK. PR à suivre.
- **Pas de mise en cache du prompt.** Chaque lot entraîne un coût de jetons d'entrée frais. Négligeable en termes absolus (~300 jetons) mais mesurable si vous exécutez des dizaines de lots par tour.
- **Résumé pour les groupes compacts fusionnés : prend l'étiquette du premier lot contributeur.** Si un utilisateur envoie dix lots dissemblables à la suite (boucle serrée, pas typique), l'en-tête compact fusionné n'affichera que l'intention du lot principal. Compromis accepté : disperser les étiquettes par lot dans une vue fusionnée est visuellement plus bruyant que de prendre la première.
- **Modèle rapide requis.** Sans `fastModel` configuré, la génération est ignorée. Le recours au modèle principal est délibérément interdit pour maintenir le profil de coût borné.

## 6. Travaux futurs

1. Brancher `ToolUseSummaryMessage` dans le pont SDK afin que la fabrique existante soit utilisée en aval.
2. Router la génération via `forkedAgent.ts` avec `enablePromptCaching` afin que les préfixes de noms d'outils répétés touchent les caches du fournisseur.
3. Optionnel : persister les entrées `tool_use_summary` dans `ChatRecordingService` et les rejouer lors de la reprise de session.
4. Optionnel : raccourcis d'étiquettes par nom d'outil (par exemple, toujours `Read <filename>` pour un seul appel `read_file`) comme chemin rapide pré-LLM.
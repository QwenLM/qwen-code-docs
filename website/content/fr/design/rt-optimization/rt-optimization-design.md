# Plan d'optimisation technique du Qwen Code Agent Loop RT

## 1. Contexte et définition du problème

### 1.1 État actuel

L'Agent Loop de Qwen Code est un modèle strictement séquentiel :

```
User Prompt → [Décision LLM] → Exécution Outil → [Décision LLM] → Exécution Outil → ... → [Réponse LLM] → Idle
               ~3-4s              ~Xms-Ns            ~3-4s              ~Xms-Ns            ~3-4s
```

Chaque appel LLM (incluant RTT réseau + inférence du modèle) prend environ 3-4s, ce qui constitue le coût principal du RT de bout en bout.

### 1.2 Données mesurées

Scénario de test : "Quels espaces de travail ai-je" (3 tours d'agent loop, 2 appels d'outil, échantillon unique)

| Phase                          | Durée     | Proportion |
| ------------------------------ | --------- | ---------- |
| Tour LLM 1 (décision d'appeler skill) | 3,8s      | 28%        |
| Exécution Skill                | 1ms       | <1%        |
| Tour LLM 2 (décision d'appeler shell) | 3,0s      | 22%        |
| Exécution Shell                | 2,5s      | 19%        |
| Tour LLM 3 (résumé textuel)    | 3,8s      | 28%        |
| Overhead framework (synchronisation état, rendu) | 0,3s      | 3%         |
| **Total**                      | **13,4s** | **100%**   |

**Conclusion** : Les appels LLM représentent 78%, l'exécution des outils 19%, le framework 3%. L'optimisation clé est de **réduire le nombre d'appels LLM** et **diminuer la latence de chaque appel LLM**.

> Note : Échantillon unique, scénario unique. Les 19% d'exécution d'outils sont dominés par un appel shell lent ; dans les scénarios read-heavy, l'exécution d'outils peut descendre en dessous de 5%. Avant la mise en œuvre de la solution, il est nécessaire de compléter une baseline avec ≥3 types de scénarios (opérations d'écriture, raisonnement multi-outils, récupération d'erreur).

### 1.3 Contraintes clés de l'architecture actuelle

| Contrainte                         | Emplacement dans le code                                                                             | Description                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Aucun contrôle post-exécution sur les résultats d'outil | `tools.ts` Interface `ToolResult` (L422)                                                             | Possède uniquement `llmContent`/`returnDisplay`/`error`, impossible d'exprimer "ignorer le LLM"           |
| Résultat toujours renvoyé au LLM   | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355)           | Tous les résultats d'outil initiés par gemini sont renvoyés                                                |
| Planification uniquement après la fin du stream | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                             | `scheduleToolCalls` n'est appelé qu'après la fin de la boucle stream, pas de planification incrémentale   |
| Aucune couche de stratégie pour la sélection du modèle | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                             | L'infrastructure est déjà en place jusqu'à `turn.run(model, …)` (L1707), mais l'appelant ne l'utilise que lorsque le skill le spécifie explicitement |

### 1.4 Infrastructure déjà prête (largement réutilisée dans cette solution)

| Capacité                                         | Emplacement                                                              | Statut                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Configuration `fastModel` + `/model --fast <id>` | `config.ts:684`, `1987`, `2021`                                          | Prêt                                                                                           |
| `SendMessageOptions.modelOverride`               | `client.ts:142` → `1598` → `turn.run`                                    | Entièrement connecté jusqu'à `geminiChat.sendMessageStream(model, …)`                           |
| Couche hook `modelOverrideRef` (pour la sélection de modèle par skill) | `useGeminiStream.ts:376`, `2225`, `1841`                                 | En place                                                                                       |
| Précédent de requête secondaire **non-stream** fast-model | `services/toolUseSummary.ts:108` (via `runSideQuery`)                    | Déployé, prouve que la configuration du modèle rapide est saine ; mais **chemin non-stream**   |
| Précédent **stream** fast-model                  | `followup/speculation.ts:224`                                            | Déployé, mais utilise un **chat fork** (`createForkedChat`), isolé du chat principal           |

**Lacune clé** : **Aucun code de production** n'exécute de streaming sur le chat principal avec un fast model. Cette solution D2 est le premier cas, une expérience de validation est nécessaire (voir §3.2 Conditions préalables).

---

## 2. Principes de conception

1. **Généralité** : La solution n'est pas liée à un outil/skill spécifique
2. **Rétrocompatibilité** : Les outils existants continuent de fonctionner sans modification
3. **Progressif + signal explicite** : La stratégie est conservatrice par défaut, les auteurs d'outils choisissent l'optimisation via des champs explicites
4. **Réversible** : Toutes les optimisations sont contrôlées par des feature flags ; l'utilisateur peut les désactiver au niveau du compte
5. **Compromis honnêtes** : Marquage clair des risques de qualité, des risques de coût et des limites d'applicabilité

---

## 3. Plan d'optimisation

### 3.1 Direction 1 : Directive post-exécution dans ToolResult

#### Problème

Actuellement, `ToolResult` ne contient aucune information sur "ce qu'il faut faire ensuite". Que le résultat de l'outil soit auto-explicatif ou non, il déclenche inconditionnellement un tour LLM.

#### Conception

Extension de l'interface `ToolResult` (`packages/core/src/tools/tools.ts` L422) :

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Nouveau : directive post-exécution
  postExecution?: {
    /**
     * Le résultat de l'outil n'est pas renvoyé au LLM, il est directement affiché à l'utilisateur comme réponse finale.
     * Convient lorsque le résultat est totalement autonome et n'a pas besoin d'être interprété à nouveau par le modèle.
     * C'est une propriété locale du ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * Le résultat de l'outil est "autonome et peut être directement affiché à l'utilisateur" – c'est-à-dire que `returnDisplay` est déjà
     * la forme finale attendue par l'utilisateur, sans besoin de traitement par le modèle.
     * C'est une propriété locale du ToolResult, **ne** prédit pas "si le tour suivant est un résumé".
     * Lié à la direction 3 (découplage de l'affichage) : true → entre dans l'état Summarizing, permettant la saisie utilisateur.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Correction de conception** : Les versions antérieures utilisaient un champ unique `selfExplanatory` pour assumer à la fois "propriété de l'artefact outil" et "signal de prédiction du flux de dialogue", mais les deux ne se recoupent pas (exemple : le prompt utilisateur est "lis X puis modifie Y", la sortie de read_file est autonome, mais le tour suivant n'est clairement pas un résumé). **Le signal de prédiction appartient à la propriété globale du flux de dialogue** et ne doit pas être exprimé via un champ d'outil – D2 utilise désormais entièrement une heuristique de flux de dialogue (voir §3.2).

#### Changement de comportement

Ajout d'une vérification dans `handleCompletedTools` :

```
Fin d'un lot d'outils
  → Vérifier `postExecution.skipLlmRound` pour tous les outils du lot
  → Tous sont true ?
    → OUI : markToolsAsSubmitted, ne pas appeler submitQuery, passer directement en idle
    → NON : conserver le comportement actuel (submitQuery)
```

**Contrainte importante** : `skipLlmRound` n'est effectif que si **tous les outils du lot actuel déclarent skip**. Un lot mixte est toujours renvoyé.

#### Invariant historique

Après avoir sauté le LLM, l'historique ressemble à : `user → function_call → function_response → <aucun assistant>`.

- Vérifier que `repairOrphanedToolUseTurnsInHistory` (appelé lors du chargement de session) tolère cette forme
- Vérifier le comportement de l'auto-compaction en l'absence de texte assistant
- La PR #4176 vient de fermer un invariant `tool_use↔tool_result` ; avant le déploiement, ajouter des tests unitaires couvrant l'alternance "tour utilisateur après skip"
- L'API Qwen / OpenAI tolère ; Anthropic a une alternance stricte — si le support direct d'Anthropic est ajouté ultérieurement, une solution de repli est nécessaire (injecter un texte assistant vide dans l'historique)

> **Point de correction unifié** : Ici et au §3.3 (D3 interruption en Summarizing), c'est **le même invariant historique** qui est rompu. Une seule des deux solutions de réparation doit être choisie (injecter un assistant vide / accepter la tolérance Qwen), et les deux directions doivent utiliser le même choix.

#### Écosystème de signaux (Travail Phase 2)

| Outil                                 | `skipLlmRound`       | `resultIsTerminal` | Remarques                                                     |
| ------------------------------------- | -------------------- | ------------------ | ------------------------------------------------------------- |
| `read_file`                           | selon scénario query-only | true               | Le contenu du fichier est la réponse                          |
| `cat` (via shell)                     | selon scénario       | true               | Comme read_file                                               |
| `grep` / `glob` / `ls`                | false                | **false (défaut)** | Les résultats nécessitent souvent sélection/classement/résumé ; le niveau skill met explicitement true en scénario "pure requête" |
| `git status` / `git log` (via shell)  | false                | true               | Sortie déjà formatée                                          |
| Outils Skill                          | Décidé par chaque skill | Décidé par chaque skill | Les skills de type requête tendent vers true                  |
| Outils MCP                            | false par défaut     | false par défaut   | Opt-in explicite via allowlist                                |

Les outils tiers/MCP ne sont pas fiables, pas de marquage par défaut ; activés explicitement via `config.toolPostExecAllowlist`.

> `grep/glob/ls` en false par défaut est un choix strict : éviter que D2/D3 ne se méprennent dans les scénarios nécessitant un résumé/tri par le modèle.

#### Quand l'utiliser et quand ne pas l'utiliser

- **Utilisable** : Requêtes terminales (type read/cat/print), résultats autonomes (skill déjà formaté)
- **Non utilisable** : Étapes intermédiaires de tâches multi-étapes, confirmation d'opérations d'écriture, logs complexes nécessitant une interprétation

#### Risques et atténuations

| Risque                                                      | Sévérité | Atténuation                                              |
| ----------------------------------------------------------- | -------- | -------------------------------------------------------- |
| L'outil définit `skipLlmRound` par erreur, interrompant une tâche multi-étapes | Moyen    | Sémantique au niveau du lot + `llmContent` toujours dans l'historique, récupérable |
| Abus par des outils tiers                                   | Moyen    | Désactivé par défaut pour MCP, activé via allowlist      |
| Rupture d'invariant historique                              | Moyen    | Ajouter des tests unitaires avant déploiement ; couvrir le rechargement de session |
| Attentes utilisateur incohérentes (résumé attendu mais absent) | Faible   | Le paramètre `alwaysSummarize: true` peut remplacer      |

#### Bénéfices

Économie de 3-4s pour les scénarios de requêtes terminales (saut du dernier tour LLM).

---

### 3.2 Direction 2 : Stratégie de routage fast-model pour le tour de résumé

#### Positionnement

**Cette direction n'introduit pas de nouveau pipeline, mais nécessite d'étendre l'interface GeminiChat pour supporter le changement de modèle à l'exécution**.

L'infrastructure du §1.4 fournit la configuration du modèle rapide et la connexion de bout en bout de `modelOverride`, mais **exécuter fastModel + streaming sur le chat principal n'a pas de précédent**, nécessite :

- Une fonction de décision : quand passer `config.getFastModel()` comme override
- Un repli sécurisé : nouvelle interface `GeminiChat.retryStreamWithModel` (gère l'état interne du chat)
- Validation expérimentale : le changement fast/primary sur le chat principal ne casse pas la compaction / l'enregistrement d'historique

#### Périmètre d'application

D2 agit uniquement sur :

- **useGeminiStream** (chemin principal TUI) — point d'appel `sendMessageStream` L1841
- **Session ACP** (chemin d'intégration IDE) — `acp-integration/session/Session.ts:1182`, refactorisation synchrone en Phase 3

D2 **n'agit pas** sur les chemins suivants, pour éviter d'introduire des modes d'échec supplémentaires dans des contextes non interactifs ou indépendants :

- **Runtime Subagent** (`agents/runtime/agent-core.ts:614`) : les sous-agents ont déjà leur propre configuration de modèle
- **Tour déclenché par Cron** (`SendMessageType.Cron`, client.ts:127) : non interactif, pas d'urgence RT
- **Tour de notification** (`SendMessageType.Notification`, client.ts:129) : idem

#### Difficulté centrale

Au moment d'appeler `submitQuery`, **nous ne savons pas** si le modèle, après avoir vu le résultat, va lancer un nouvel outil ou simplement produire du texte. Si nous utilisons le fast model alors que le modèle a besoin d'appeler un outil, la conséquence est **silencieuse** : le fast model pourrait appeler le mauvais outil ou avec les mauvais paramètres, sans signal d'erreur évident.

**Aucun champ au niveau de l'outil ne peut prédire de manière fiable** "si le tour suivant est un résumé", car cela dépend du flux de dialogue (prompt utilisateur + contexte cumulé), pas d'une propriété locale de l'artefact outil. Exemple :

```
Utilisateur : "Lis utils.ts puis remplace tous les console.log par logger.info"
  → Outil 1 : read_file → résultat autonome
  → Mais le tour suivant n'est clairement pas un résumé
```

Par conséquent, D2 utilise exclusivement une **heuristique de flux de dialogue** pour la prédiction, sans dépendre de champs d'outil.

#### Fonction de décision : Heuristique de flux de dialogue + Veto

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== Contrainte au niveau utilisateur (priorité la plus haute) =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // toujours soumis aux contraintes de sécurité d'exécution

  // ===== Veto basé sur l'intention utilisateur =====
  // 1. Le prompt utilisateur contient un verbe d'action → forte probabilité de nouvel appel d'outil
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. Le lot actuel contient un outil mutateur → forte probabilité de vérification/lecture ultérieure
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. Le lot actuel ou l'historique contient une erreur non résolue → le modèle a besoin de primary pour diagnostiquer
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== Veto basé sur la complexité de la sortie =====
  // 4. Le prompt utilisateur nécessite un raisonnement approfondi (explique/compare/pourquoi)
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. Appels à ≥3 outils différents → narration multi-résultats nécessite primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. Sortie d'outil trop longue → résumé de contenu long nécessite primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== Veto basé sur la faisabilité du modèle =====
  // 7. La fenêtre de contexte du fast model est insuffisante → le passage au fast déclencherait une compression
  //    (la compression elle-même nécessite un appel LLM, ce qui ralentit et augmente le coût)
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== Repli multilingue =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Repli basé sur l'état de la session =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Signification des huit vetos :

- **`requestImpliesFurtherAction`** : verbes d'action (`改|删|加|替换|修复|实现|新建|create|fix|change|add|remove|implement|write|update`) → tâche multi-étapes
- **`MUTATOR_KINDS` match** : déjà écrit dans ce tour → forte probabilité de lecture/vérification suivante. **Réutilise `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` déjà présent dans `tools.ts:806`** (la propriété `kind: Kind` de chaque instance `Tool` est la classification faisant autorité, ne pas réinventer `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`** : jugement en deux parties — 
  - **Toute erreur dans le lot actuel → toujours non résolu** (ne pas supposer qu'un lot parallèle peut s'auto-corriger)
  - **Historique dédupliqué par `(toolName, args fingerprint)`, la dernière occurrence encore en erreur est considérée non résolue** (uniquement par toolName, avec des paramètres différents, cela peut être mal jugé)
  - shell etc. doivent correctement remplir `ToolResult.error` (dépend de la qualité des données en amont)
- **`needsDeepReasoning`** : contient des mots-clés comme "analyse/explique/pourquoi/compare/diagnostic"
- **`needsCrossResultReasoning`** : appels d'outils distincts ≥3 (même outil avec mêmes paramètres considéré comme un seul)
- **Sortie tokens > 4000** : seuil empirique, **à ajuster après mesures de base du fast model**
- **`wouldTriggerCompression`** : la fenêtre de contexte du fast model est généralement plus petite que celle du primary ; pour le même historique, le fast déclenchera `tryCompress` plus tôt (geminiChat.ts:1418) — la compression elle-même nécessite un appel LLM, ce qui pourrait **dégrader le RT et augmenter le coût**. Estimation budgétaire : `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` est considéré comme déclencheur
- **Langue non prise en charge** : uniquement détection de mots-clés chinois/anglais ; autres langues (japonais, coréen, etc.) par défaut primary
- **Changement d'état de session** : première continuation après `/compact` ou `/clear` → primary pour reconstruire le modèle mental

Les vetos penchent **vers primary** (plutôt 2s de plus que de perdre en qualité).

#### Implémentation clé : `GeminiChat.retryStreamWithModel`

**Problème** : Abort + appel direct à `client.sendMessageStream` briserait l'état du chat :

1. `geminiChat.ts:1428` pousse `userContent` dans l'historique dès le démarrage du stream ; un redémarrage le **pousserait à nouveau**, entraînant une duplication de `function_response` dans l'historique
2. Le verrou `sendPromise` (`geminiChat.ts:1392, 1398`) — après abort, il faut garantir que `streamDoneResolver` est appelé
3. Les marqueurs d'invariant comme `pendingPartialState` introduits par PR #4176 doivent être correctement nettoyés
4. L'attribut model du span Telemetry doit être mis à jour

**Nouvelle interface** (`packages/core/src/core/geminiChat.ts`) :

```typescript
/**
 * Relance un send stream en cours ou venant d'être avorté avec un modèle différent.
 * NE repousse PAS userContent (conservé du send original).
 * Réinitialise pendingPartialState ; libère le sendPromise obsolète ; rouvre un span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

Contrat d'appel :

- Uniquement après abort du send original (pas de concurrence)
- prompt_id réutilisé (même intention utilisateur)
- Le userContent déjà poussé dans l'historique n'est pas repoussé

Effort d'implémentation : environ 1,5j + tests unitaires.

#### Protection à l'exécution

`selectContinuationTier` retourne `'fast'` mais le stream reçoit un événement `ServerGeminiEventType.ToolCallRequest` → **abort immédiat du stream actuel, appel à `retryStreamWithModel(primaryModel)`**.

Cela couvre le seul scénario d'erreur silencieuse "prédit résumé mais nécessite encore un outil". Coût : un appel fast gaspillé en tokens (attribution des coûts voir §5.3).

#### Découplage avec le `modelOverride` du skill

`useGeminiStream.modelOverrideRef` (L376, L2225) porte actuellement **le modèle choisi explicitement par le skill**, relevant de la "sémantique métier". Le routage fast de cette direction relève de la "sémantique d'optimisation". Les deux **doivent être séparés** :

```typescript
// Nouveau ref indépendant
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// Point d'appel fusionné (ne réutilise pas modelOverrideRef)
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // choix explicite du skill en priorité
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

Cycle de vie :

| Moment                                      | `modelOverrideRef` (skill) | `summaryTierRef` (routage fast)          |
| ------------------------------------------- | -------------------------- | ---------------------------------------- |
| Nouveau tour utilisateur (`!Retry && !ToolResult`) | Vidé                       | Vidé                                     |
| L'outil skill retourne le champ `modelOverride` | Écrit                      | Inchangé                                 |
| Lot d'outils terminé → `selectContinuationTier` | Inchangé                   | Écrit                                    |
| Repli runtime (ToolCallRequest vu)          | Inchangé                   | Mis à jour en `'primary'`                |
| Retry (Ctrl+Y manuel utilisateur)           | Conservé                   | Mis à jour en `'primary'` (fast ayant échoué, ne plus retenter fast) |

Le choix explicite du skill **gagne toujours** — l'intention explicite de l'utilisateur prime sur la stratégie d'optimisation.

#### Correction Telemetry

Le span d'interaction `client.ts:1303` enregistre l'attribut `model` au démarrage du tour. Lorsqu'un fallback est déclenché, le modèle change réellement, les données du span sont faussées. Nécessite :

```typescript
// Lors du déclenchement du fallback
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

Et dans `addUserPromptAttributes`, distinguer `requested` / `actual` pour éviter les confusions de facturation/audit.

#### Interrupteur de forçage au niveau utilisateur

Nouveau paramètre (`packages/cli/src/config/settingsSchema.ts`) :

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'` : utilise `selectContinuationTier` (recommandé)
- `'always_primary'` : désactive complètement l'optimisation D2 (scénarios sensibles à la production)
- `'always_fast'` : ignore les vetos, **toujours soumis aux contraintes de sécurité d'exécution** (utilisateurs avancés)

Raison : D2 échange qualité contre vitesse, certains utilisateurs/scénarios ont besoin d'un droit explicite de désactivation.

#### Conditions préalables

- `config.getFastModel()` configuré
- **Expérience de validation du streaming fastModel sur le chat principal** (1j avant codage) :
  - Simuler un outil avec `resultIsTerminal=true`, déclencher des tours de résumé répétés sur le chat principal
  - Observer si `tryCompress` est déclenché par erreur (fenêtre de contexte du fast model plus petite peut déclencher prématurément)
  - Observer si la sortie de chatRecordingService a un mismatch de modèle
  - Vérifier si l'appel fast unique suivant peut lire correctement l'historique
- **Mesures de base du modèle fast candidat** (1j) :
  - Exécuter 100 prompts de tour de résumé (entrée contenant `function_response`), mesurer la latence de bout en bout P50/P95 et le time-to-first-token
  - Mesurer le taux de déclenchement de `tryCompress` `P_compact`, vérifier que le gain RT net = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - Activer uniquement si le fast P50 ≤ primary P50 × 0,5 et P95 ≤ primary P95 × 0,6
- Le fast model et le primary model doivent être de la même famille (éviter les différences d'encodage de `function_response`) ; un crossing de famille doit être rejeté par la couche `getFastModel()`
- **Compatibilité `thinkingConfig`** :
  - Le fast model doit être cohérent avec le primary en ce qui concerne le support `thinkingConfig.includeThoughts` ; ou
  - Le chemin fast force `includeThoughts: false` (aligné avec `sideQuery.ts:118-122`)
  - Validation : lorsque l'historique contient des thought parts, le fast model doit les traiter correctement (pas d'erreur, ne pas traiter thought comme entrée utilisateur)

#### Risques et atténuations

| Risque                                                                                     | Sévérité | Atténuation                                                                                                                                |
| ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Le fast model appelle un mauvais outil silencieusement                                     | Élevée   | Heuristique de flux de dialogue + protection d'abort ToolCallRequest runtime                                                               |
| Le fast modèle hallucine une "réponse erronée visible par l'utilisateur" sur une entrée contenant une erreur | **Élevée** | Veto `hasUnresolvedError` ; surveiller le taux de relance utilisateur (note : le risque similaire de `emitToolUseSummaries` n'affecte qu'un label de 60 tokens, ce risque affecte la réponse finale, d'un ordre de grandeur plus élevé) |
| Le chemin fast déclenche `tryCompress` → un appel LLM supplémentaire, **dégradation du RT et du coût** | **Élevée** | Barrière `wouldTriggerCompression` préventive (voir fonction de décision #7) ; mesurer le seuil P_compact en amont                        |
| Quel modèle utilise la compression elle-même                                               | Moyen    | Si compression déclenchée, abandon du routage fast (barrière gate #7) ; éviter les problèmes de réponse                                   |
| Le changement de modèle sur le chat principal perturbe l'état interne/enregistrement du chat | Moyen    | Expérience de validation préalable couverte ; test de relecture de session resume                                                          |
| D2 et `emitToolUseSummaries` déclenchent simultanément un appel fast concurrent, dépassement de rate-limit | Moyen    | Choix binaire : désactiver `emitToolUseSummaries` quand D2 est activé (le titre n'affecte pas la fonctionnalité), ou partager un bucket de tokens rate-limit |
| `thinkingConfig` incohérent entre fast/primary entraînant une erreur d'analyse de l'historique | Moyen    | Même famille + chemin fast force `includeThoughts: false` (voir conditions préalables)                                                     |
| Le chemin de fallback est plus coûteux (gâchis de tokens fast + primary complet)           | Moyen    | Surveillance des logs de décision `fast_tokens_consumed` ; désactiver automatiquement le flag si taux de fallback >20%                    |
| Distorsion du model dans le span Telemetry                                                 | Moyen    | Séparation `requested` / `actual` (voir correction Telemetry)                                                                              |
| Incompatibilité de format de contexte (crossing de famille)                                | Moyen    | `getFastModel()` refuse les choix cross-famille                                                                                            |
| Conflit sémantique avec le modelOverride du skill                                          | Moyen    | Ref indépendant + priorité skill                                                                                                           |
| `/model` change le modèle principal à l'exécution, rendant la décision `summaryTierRef` invalide | Faible   | Vider `summaryTierRef` de manière synchrone lors de la commande `/model`                                                                   |
| fast tokens/s plus lent                                                                    | Faible   | Mesurer également TTFT lors des tests, pas seulement le RT total                                                                           |

#### Bénéfices (à valider par mesure)

- **RT** : Économie de 2-3s sur le tour de résumé (ne pas mettre dans le titre de PR avant mesure)
- **Coût** : Le prix unitaire du fast model est généralement nettement inférieur à celui du primary ; dans les scénarios de résumé fréquent, le coût en tokens pourrait baisser de 30-50% ; mais le gâchis du chemin de fallback annulera une partie du bénéfice, nécessitant une mesure réelle via `fast_tokens_consumed` pour confirmer le bénéfice net

---

### 3.3 Direction 3 : Découplage entre l'affichage des résultats et l'interaction (Presentation Decoupling)

#### Problème

L'utilisateur, une fois l'outil terminé, doit attendre la fin du tour de résumé LLM avant de pouvoir saisir à nouveau :

```
Outil terminé → [Rendu résultat] → [submitQuery] → [Attente réponse stream LLM 3-4s] → Idle → Saisie possible
                                         ~~~~~~~~~~~~~~~~~~~~~~~~
                                         L'utilisateur voit déjà le résultat mais ne peut pas agir
```

#### Conception

Nouvel état `StreamingState.Summarizing` :

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // Nouveau
}
```

#### Changement dans la machine à états

```
Outil terminé et résultat affiché
  → Si `postExecution.resultIsTerminal === true` pour tous les outils du lot :
    → Entrer dans l'état Summarizing (utilisateur peut saisir)
    → submitQuery exécuté de manière asynchrone
    → Le résumé LLM est ajouté à l'historique (ou annulé par un nouveau message utilisateur)
  → Sinon :
    → Rester en état Responding (utilisateur ne peut pas saisir)
```

#### Gestion d'un nouveau message utilisateur

- Dans l'état `Summarizing`, si l'utilisateur soumet un nouveau message → abort du résumé en cours → traiter le nouveau message
- Le **texte partiel du résumé déjà généré est jeté** (pas dans l'historique), pour éviter qu'une demi-phrase assistant ne pollue le contexte
- `function_response` reste dans l'historique (le modèle sait que l'outil a été exécuté)
- Les followup suggestions etc. sont déclenchées après la fin ou l'annulation du Summarizing

#### Liste de nettoyage du texte partiel lors de l'abort

Le texte partiel est réparti à plusieurs endroits, doit être **nettoyé simultanément**, sinon incohérence d'état :

| Emplacement                                                                 | Action de nettoyage                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current` (état React useGeminiStream)                | Mettre à `null`, ne pas appeler `addItem`                                                       |
| Accumulation interne dans `GeminiChat.history`                              | Si du contenu assistant partiel a déjà été poussé avant abort, doit être rollbacké via une nouvelle interface `discardPendingAssistant()` |
| `ChatRecordingService` buffered turn                                        | Marquer comme cancelled, ne pas écrire dans JSONL                                               |
| `dualOutput.emitText` (si activé)                                           | Envoyer un sentinel d'abort, le sidecar jette lui-même                                          |
| `loopDetectorRef` tokens cumulés                                            | Réinitialiser le compteur du tour actuel                                                        |
Ordre d'exécution : le signal d'abort est déclenché → les cinq nettoyages ci-dessus sont terminés → un nouveau message utilisateur est autorisé à entrer dans `submitQuery`. La couverture des tests de concurrence inclut : l'abort est déclenché au moment exact où le dernier chunk est reçu.

#### Conditions d'application

L'ensemble du batch doit avoir `postExecution.resultIsTerminal === true`.

#### Invariant d'historique (même origine que §3.1)

Interrompre la phase Summarizing pendant son exécution produit :

```
[user_1, function_call, function_response, user_2]
                                          ↑ pas de tour assistant
```

**Cela viole le même invariant que celui que §3.1 brise en sautant le tour LLM**, et doit être corrigé avec la même stratégie que D1 (injecter un assistant vide / accepter la tolérance de Qwen).

- Réutiliser la couverture de test unitaire de l'invariant de D1
- La relecture de session-load (incluant `repairOrphanedToolUseTurnsInHistory`) doit couvrir cette forme
- Alternance Anthropic : en connexion directe, ajouter une solution de repli avec D1

#### Risques et atténuations

| Risque                                                               | Gravité | Atténuation                                                                                     |
| -------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| Une demi-phrase assistant entre dans l'historique lors d'un abort    | **Moyen**   | Jeter explicitement le texte partiel ; ne conserver que le function_response ; tests unitaires couvrant la race |
| Invariant d'historique violé (pas d'assistant pour la suite)        | **Moyen**   | Problème de même origine que D1, correction unifiée (voir §3.1 Invariant d'historique)          |
| Complexité accrue de l'état UI                                      | Moyen   | Summarizing = Idle + tâche d'arrière-plan ; chemin d'entrée utilisateur réutilise Idle          |
| Bénéfice perçu par l'utilisateur dépend du modèle de comportement   | Faible  | Si l'utilisateur ne saisit pas dans les 3s, le résumé est terminé → pas de bénéfice perçu ; mais **pas de régression** |

#### Bénéfices

- **Limite théorique** : RT perçue de 3-4s (l'utilisateur saisit dès la fin des outils)
- **Médiane réelle** : dépend de l'intervalle de saisie utilisateur — les utilisateurs qui lisent les résultats pendant 2-5s avant de saisir ne ressentiront pas la différence, mais **jamais plus lent**

---

### 3.4 Direction 4 : Ordonnancement anticipé en flux (Stream-Ahead Scheduling)

#### Problème

`processGeminiStreamEvents` planifie les outils en lot uniquement après la fin complète du flux. L'événement `ToolCallRequest` peut être émis en milieu de flux.

#### Conception

Dans le traitement des événements du flux, lancer immédiatement une **pré-validation** (sans exécution) pour `ToolCallRequest` :

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // nouveau
  break;
```

`CoreToolScheduler.prevalidate(request)` :

1. Rechercher l'enregistrement de l'outil
2. Construire l'invocation
3. Exécuter `shouldConfirmExecute` (mettre en cache le résultat)
4. Lors de `schedule()`, utiliser directement le résultat en cache

#### Contrat de pureté et Allowlist

`prevalidate` exige que `shouldConfirmExecute` soit sans effet de bord **et** que son résultat ne puisse pas être invalidé de l'extérieur entre la pré-validation et l'ordonnancement.

**Réutiliser directement `CONCURRENCY_SAFE_KINDS` de `tools.ts:818`** :

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

Il s'agit de la classification existante du projet « sans effet de bord + concurrentiel », qui correspond parfaitement au besoin de pré-validation.

| Kind d'outil              | Dans l'allowlist        | Raison                                                                                |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `Read` (read_file, etc.)  | ✅                      | Lecture pure                                                                          |
| `Search` (grep / glob)    | ✅                      | Lecture pure                                                                          |
| `Fetch` (web_fetch, etc.) | ✅                      | Lecture à distance, pas d'effet de bord en écriture                                   |
| `Edit`                    | **❌** (voir TOCTOU ci-dessous) | shouldConfirmExecute est en lecture pure, mais le diff peut devenir invalide entre la pré-validation et l'ordonnancement |
| `Delete` / `Move` / `Execute` | ❌                      | MUTATOR_KINDS                                                                         |
| `Think`                   | ❌                      | Contient des écritures implicites comme save_memory / todo_write                      |
| Outils MCP                | ❌                      | Non fiables                                                                            |

**TOCTOU : pourquoi Edit n'est pas dans l'allowlist**

Théoriquement, `shouldConfirmExecute` pour Edit est une lecture pure (lire le fichier, calculer le diff). Mais il existe une fenêtre temporelle entre la pré-validation et l'ordonnancement :

```
T=0      le flux reçoit Edit(file=a.ts, ...) → pré-validation
T=10ms   shouldConfirmExecute lit a.ts, met en cache diff_v0
T=300ms  le flux se termine, scheduler.schedule()
T=305ms  entre-temps, un autre outil / IDE / processus externe modifie a.ts
T=310ms  le scheduler utilise diff_v0 pour l'affichage utilisateur
T=320ms  l'utilisateur confirme en se basant sur v0
T=330ms  Edit applique les anciens params au fichier v1 → contenu corrompu / échec du merge
```

C'est un problème TOCTOU. Directions de correction :

- **A (recommandé)** : Edit n'entre pas dans l'allowlist, la pré-validation ne couvre que les trois catégories `CONCURRENCY_SAFE_KINDS`. Coût : le gain passe de « 50-200ms (dominé par Edit) » à « 50-100ms (lecture uniquement) ».
- **B (optionnel, renforcement)** : Edit entre dans l'allowlist mais le cache est accompagné de `(mtime, size, content_hash)` ; lors de `schedule()`, vérifier que rien n'a changé avant d'utiliser le cache, sinon recalculer.

La documentation choisit provisoirement A.

#### Interaction avec l'ordonnancement parallèle existant

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) utilise `partitionToolCalls` pour diviser les outils en « batch concurrentiel sûr » et « batch séquentiel », le batch concurrentiel étant exécuté via `runConcurrently` (L2473).

La pré-validation doit s'aligner sur ce modèle de partitionnement :

- Le cache est indexé par `callId` (pas par `(toolName, args)`, pour éviter les conflits entre appels concurrents de même nom)
- Un appel en échec de pré-validation → n'affecte pas les autres appels ; lors de l'ordonnancement, cet appel emprunte le chemin original `shouldConfirmExecute`
- L'annulation du flux annule en cascade tous les appels de pré-validation en vol via le `signal`

#### Risques

| Risque                                                                               | Gravité | Atténuation                                                                                       |
| ------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| Incohérence entre le diff en cache et le fichier réel au moment de la confirmation (TOCTOU) | **Élevée**   | Solution A : Edit n'entre pas dans l'allowlist ; Solution B : le cache vérifie `(mtime, size, hash)` |
| Un échec de pré-validation impacte l'ordonnancement                                  | Faible  | En cas d'échec/délai d'attente, retour au chemin original `shouldConfirmExecute` ; absence de cache ≡ pas activé |
| Concurrence sur les descripteurs de fichiers / contention de ressources              | Faible  | `QWEN_CODE_MAX_TOOL_CONCURRENCY` limite déjà la concurrence maximale (par défaut 10)             |

#### Bénéfices

50-100ms/tour (uniquement dans le périmètre `CONCURRENCY_SAFE_KINDS`). Avec la solution B incluant Edit, le gain théorique est de 100-200ms.

---

## 4. Évaluation globale et feuille de route

### 4.1 Évaluation globale

| Direction                   | Gain RT                      | Complexité de mise en œuvre | Risque qualité | Dépendances                                     | Priorité |
| --------------------------- | ---------------------------- | --------------------------- | -------------- | ----------------------------------------------- | -------- |
| D1 Instruction post-outil   | 3-4s/tour terminal           | Faible (2-3j)               | Faible         | Aucune                                          | **P0**   |
| D2 Routage rapide résumé    | 2-3s/tour résumé (à mesurer) | **Moyen-Élevée (9j)**       | Moyen-Élevée   | Heuristique D2 + expérience de validation chat principal + synchronisation ACP | **P1**   |
| D3 Découplage affichage     | 3-4s amélioration perçue (dépend du comportement utilisateur) | Moyen (3-5j, incluant correction invariant) | Moyen          | Correction invariant historique D1              | **P1**   |
| D4 Ordonnancement anticipé  | 50-200ms/tour                | Élevé (5-7j)                | Très faible    | Aucune                                          | P2       |

#### Détail de charge pour D2

| Sous-tâche                                                                                                          | Estimation |
| ------------------------------------------------------------------------------------------------------------------- | ---------- |
| Expérience de validation fastModel-streaming du chat principal (incluant la mesure `P_compact`)                     | 1j         |
| Mesure de base des candidats modèles rapides (incluant TTFT, P95, compatibilité `thinkingConfig`)                   | 1j         |
| Intégration de `selectContinuationTier` + `summaryTierRef` (dans useGeminiStream)                                  | 0,5j       |
| Implémentation de l'heuristique (incluant réutilisation `MUTATOR_KINDS` / estimation `wouldTriggerCompression` / multilangue / mutation d'état) | 1j         |
| Implémentation de l'interface `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`                         | 1,5j       |
| Adaptation de la synchronisation ACP Session (acp-integration/session/Session.ts)                                   | 1j         |
| Correction des spans Telemetry (dédoublement `requested` / `actual`)                                                | 0,5j       |
| Intégration du paramètre utilisateur `summaryTierStrategy` + schéma JSON + `/config`                                | 0,5j       |
| Tests unitaires (race, moment d'abort, invariants d'historique, chemins de fallback, chemin ACP)                    | 2j         |
| **Total**                                                                                                           | **9j**     |

> Note : l'estimation initiale de 6,5j n'incluait pas les coûts du chemin ACP, du garde-fou `wouldTriggerCompression`, de la liste de nettoyage, de l'ingénierie du schéma de paramètres, etc.

### 4.2 Feuille de route de mise en œuvre

#### Phase 1 : D1 Instruction post-outil (1 semaine)

- Étendre `ToolResult.postExecution` (tools.ts L422) : `skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` implémente le court-circuit `skipLlmRound` (useGeminiStream.ts L2038)
- Tests unitaires couvrant l'invariant d'historique
- **La Phase 1 ne consomme pas `resultIsTerminal`** (réservé à la Phase 3)

#### Phase 2 : Construction de l'écosystème de signaux (2 semaines, en parallèle avec Phase 4)

- Les outils intégrés reçoivent progressivement les marqueurs `skipLlmRound` / `resultIsTerminal` (voir tableau §3.1)
- Vérifier que la couverture des marqueurs est ≥60 % (pondéré par nombre de tours, pas par nombre d'appels)
- Collecter des données de production, calibrer les seuils du garde-fou de récusation §3.2
- À la fin de la Phase 2, exécuter l'expérience de validation du chat principal de §3.2 et les mesures de base

#### Phase 3 : D2 + D3 (environ 3 semaines, incluant synchronisation ACP)

> **Correction** : le plan précédent estimait 1 semaine, sans inclure l'expérience de validation fastModel-streaming, l'implémentation de `retryStreamWithModel`, la correction unifiée des invariants, ni la synchronisation du chemin ACP.

- Avant le codage : terminer l'expérience de validation du chat principal + mesures de base (incluant compatibilité `P_compact` avec thinkingConfig)
- Ajouter `summaryTierRef` + `selectContinuationTier` (incluant le garde-fou `wouldTriggerCompression`)
- Ajouter `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **Adapter en parallèle le chemin ACP Session** (acp-integration/session/Session.ts) en utilisant la même fonction de décision
- Ajouter `StreamingState.Summarizing` + réutilisation du chemin d'entrée + liste de nettoyage pour l'abort
- Correction unifiée des invariants d'historique (même source D1+D3)
- Feature flag `experimental.summaryRoundFastModel: false`, **désactivé par défaut dans la Release N**
- Paramètre utilisateur `summaryTierStrategy`
- Correction des spans Telemetry
- Filet de sécurité à l'exécution (abort ToolCallRequest + retryStreamWithModel)

#### Phase 4 : D4 Ordonnancement anticipé (peut être inséré indépendamment)

- `CoreToolScheduler.prevalidate` + allowlist
- Ordonnancement incrémental dans `processGeminiStreamEvents`

---

## 5. Mesures, validation et limites

### 5.1 Indicateurs de performance

| Indicateur                         | Référence | Phase 1 | Phase 3                       |
| ---------------------------------- | --------- | ------- | ----------------------------- |
| RT de bout en bout P50 (3 tours)   | 13,4s     | <10s    | <8s (à mesurer)               |
| RT de bout en bout P95             | -         | <13s    | <12s (limite du chemin de fallback) |
| Temps perçu jusqu'au premier résultat P50 | 13,4s     | <10s    | <5s (D3 activé)               |
| Temps perçu jusqu'au premier résultat P95 | -         | <13s    | <8s                           |
| Nombre d'appels LLM (scénarios pouvant être sautés) | 3         | 2       | 2 (plus rapide)               |

> Note : la référence est un échantillon unique ; au moins 3 scénarios doivent être ajoutés avant déploiement.

### 5.2 Indicateurs de qualité

| Indicateur                                                             | Référence | Dégradation autorisée |
| ---------------------------------------------------------------------- | --------- | --------------------- |
| Précision du tool-calling (tour résumé avec modèle rapide)             | 100%      | ≥98%                  |
| Taux de mauvaise utilisation de `skipLlmRound` (utilisateur demande « plus de détails ») | -         | <1%                   |
| Taux de `fallback_triggered` pour le modèle rapide                     | -         | <10% (>20% désactive automatiquement le flag) |
| Pas de demi-phrase assistant dans l'historique pendant Summarizing    | 0         | 0 (strict)            |

### 5.3 Indicateurs de coût

| Indicateur                                      | Référence | Objectif Phase 3                                              |
| ----------------------------------------------- | --------- | ------------------------------------------------------------- |
| Coût en tokens par millier de sessions (tour résumé) | 100%      | <70%                                                          |
| Proportion de tokens gaspillés par fallback     | 0         | <15% (taux de fallback × tokens rapides d'une fois / tokens primaires d'une fois) |

### 5.4 Schéma du journal de décision

Chaque décision clé de `selectContinuationTier` et `handleCompletedTools` est enregistrée dans un journal structuré :

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // décision (avant fallback)
  tier_actual:    'fast' | 'primary',          // réellement exécuté (après fallback)
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // en double en cas de fallback
  fast_tokens_consumed: int,                    // tokens gaspillés par fallback (imputation de coût)
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Indicateurs observés :

- Taux de déclenchement du mode rapide (attendu 30-50 %)
- Taux de `fallback_triggered` (attendu <10 % ; >20 % suggère de désactiver le flag par défaut dans la prochaine release)
- Proportion de chaque veto (identifier si trop strict ou trop laxiste)
- `fast_tokens_consumed` × `fallback_rate` (risque de retour de coût)
- Fréquence des demandes utilisateur « plus de détails » (signal de régression de la qualité du modèle rapide)

**Note de mesure pour `fast_tokens_consumed`** :

Un flux interrompu par abort **ne reçoit probablement pas `finishReason` / `usageMetadata`** — ces derniers ne sont remplis qu'à la fin complète du flux. L'implémentation doit estimer :

- Priorité : avant l'abort, essayer `stream.return()` pour que le générateur passe par le chemin finally, peut-être obtenir un usage partiel
- Repli : cumuler la longueur des chunks de texte déjà reçus × 4 pour estimer les tokens de sortie ; les tokens d'entrée sont estimés via l'historique
- Marquage : le champ du journal est accompagné de `tokens_source: 'usage' | 'estimated'` ; l'analyse postérieure doit distinguer

### 5.5 Méthode de validation et stratégie de publication

#### Validation

- Réutiliser le cadre de chronométrage `/tmp/tool-timing.log`
- Ajouter `T_userIdle` (moment où l'utilisateur peut à nouveau saisir)
- Ajouter `T_firstToken` (moment du premier token en streaming)
- Test A/B comparant la distribution des RT et des coûts avant/après chaque Phase

#### Stratégie de publication (adaptée au CLI local)

Qwen Code est un CLI local, **sans capacité de déploiement à chaud** — le traditionnel « 5% / 25% / 100% de déploiement progressif » ne s'applique pas. On adopte une **progression par releases** :

| Phase                  | Release                    | Valeur par défaut du feature flag | Condition de déclenchement                                                                         |
| ---------------------- | -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Phase 3a : dogfood     | Release N                  | `false`                          | Les utilisateurs internes activent avec `summaryTierStrategy=always_fast`                          |
| Phase 3b : opt-in par défaut | Release N+1 (≥2 semaines) | `false` (inchangé)               | Les journaux de décision du dogfood sont conformes : fallback <10%, gain net RT/coût >0            |
| Phase 3c : activé par défaut | Release N+2 (≥4 semaines) | `true`                           | Aucun rapport de régression de qualité au niveau utilisateur en Phase 3b                           |
| Retour arrière         | Release N+3 (si nécessaire) | `true → false`                   | Fallback massif >20% ou dégradation des indicateurs de qualité                                     |

**Mécanisme de retour arrière** :

- Pas de déploiement à chaud, **le retour arrière = publier une nouvelle release avec le flag par défaut désactivé**
- Le paramètre utilisateur `summaryTierStrategy=always_primary` offre toujours un canal « Je veux sortir immédiatement », ne dépendant pas d'une nouvelle release
- Le `fallback_rate` / `cost_regression` des journaux de décision est évalué à chaque cycle de Release pour décider de la suite

### 5.6 Limitations connues

1. **Données de référence insuffisantes** : un seul échantillon ne couvre pas tous les modes de tâche ; des scénarios doivent être ajoutés avant déploiement
2. **Prémisse du modèle rapide** : aucun modèle de la même famille ne doit être significativement plus rapide et atteindre le niveau de tool-calling requis → D2 n'est pas activé
3. **`skipLlmRound` est un échange qualité/vitesse** : sauter le LLM = renoncer à la compréhension et à la correction du modèle, applicable uniquement aux scénarios à forte déterminisme
4. **D2 est un échange qualité+coût/vitesse** : la qualité du modèle rapide est inférieure à celle du modèle primaire ; le chemin de fallback est en fait plus coûteux — le bénéfice net doit être mesuré avec les journaux de décision
5. **Le déclenchement de `tryCompress` peut aggraver la situation** : le contexte du modèle rapide est plus petit, la compression consomme elle-même des appels LLM — le garde-fou `wouldTriggerCompression` est une défense indispensable
6. **Le découplage de l'affichage modifie le modèle d'interaction** : le nouveau modèle nécessite une adaptation de l'utilisateur ; le comportement de l'utilisateur détermine le gain réel perçu
7. **La latence réseau n'est pas contrôlable** : cette solution réduit le nombre d'appels, n'optimise pas la latence d'un seul appel
8. **La connexion directe Anthropic n'est pas couverte** : la tolérance actuelle d'alternance dépend des API de style Qwen / OpenAI
9. **fastModel-streaming sur le chat principal est une première** : aucun précédent en production, nécessite une expérience de validation indépendante
10. **CLI local sans déploiement à chaud** : la stratégie de publication ne peut qu'avancer par releases, sans ajustement progressif rapide
11. **D2 n'affecte que le chemin d'interaction** : Subagent / Cron / Notification ne bénéficient pas, c'est intentionnel
12. **Impact à long terme de l'historique mixte de modèles inconnu** : après activation de D2, les tours de session basculent entre rapide/principal ; la reprise des sessions longues et la cohérence contextuelle nécessitent une observation
13. **Gain réduit pour D4** : après le retrait d'Edit de l'allowlist, la pré-validation ne couvre que les outils de lecture pure (50-100ms de gain) ; le gain de 200ms avec Edit nécessite le mécanisme de vérification mtime/hash de la solution B

### 5.7 Emplacements clés du code

| Fichier                                                     | Symbole clé                                                | Emplacement |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------- |
| `packages/core/src/tools/tools.ts`                          | Interface `ToolResult`                                     | L422        |
| `packages/core/src/tools/tools.ts`                          | Enum `Kind` + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`   | L793, L806, L818 |
| `packages/core/src/tools/tools.ts`                          | `DeclarativeTool.kind: Kind` (chaque instance de Tool porte un kind) | L165        |
| `packages/core/src/core/client.ts`                          | `SendMessageOptions.modelOverride`                         | L142        |
| `packages/core/src/core/client.ts`                          | `sendMessageStream`                                        | L1216       |
| `packages/core/src/core/client.ts`                          | `modelOverride ?? getModel()`                              | L1305, L1598 |
| `packages/core/src/core/client.ts`                          | `turn.run(model, …)`                                       | L1707       |
| `packages/core/src/core/geminiChat.ts`                      | `sendMessageStream(model, …)`                              | L1387       |
| `packages/core/src/core/geminiChat.ts`                      | `history.push(userContent)`                                | L1428       |
| `packages/core/src/core/geminiChat.ts`                      | Verrou `sendPromise`                                       | L1392       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`              | `modelOverrideRef` (sélection du modèle pour les skills)   | L376, L2225 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`              | `processGeminiStreamEvents`                                | L1365       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`              | Point d'appel `sendMessageStream`                          | L1841       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`              | `handleCompletedTools`                                     | L2038       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`              | `submitQuery(ToolResult, …)`                               | L2355       |
| `packages/core/src/services/toolUseSummary.ts`              | Requête secondaire modèle rapide (précédent non-streaming) | L108        |
| `packages/core/src/followup/speculation.ts`                 | Streaming modèle rapide (précédent chat fork)               | L224        |
| `packages/core/src/config/config.ts`                        | `fastModel` + `getFastModel` + `setFastModel`              | L684, L1987, L2021 |
| `packages/core/src/core/coreToolScheduler.ts`               | `attemptExecutionOfScheduledCalls`                         | L2436       |
| `packages/core/src/core/coreToolScheduler.ts`               | `runConcurrently` + `partitionToolCalls`                    | L2473       |
| `packages/cli/src/acp-integration/session/Session.ts`       | Point d'appel `sendMessageStream` (chemin ACP / IDE)       | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`            | `sendMessageStream` de Subagent (non affecté par D2)       | L614        |

---

## 6. Enregistrement de vérification de la revue (2026-05-26)

### 6.1 Méthode de vérification

Pour les hypothèses de qualité des données préalables et les estimations de bénéfices **uniquement déclarées, non quantifiées** dans le document de conception, 4 subagents Explore parallèles sont lancés pour une recherche de code en lecture seule. Chaque subagent répond à une seule question factuelle, sans porter de jugement ni donner de suggestion d'optimisation. La recherche est basée sur la branche `main` actuelle (HEAD: `026f2f768`).

| Question de vérification                                        | Section associée                        |
| --------------------------------------------------------------- | --------------------------------------- |
| Q3 Taux de remplissage actuel du champ `ToolResult.error` pour tous les outils | §3.2 Dépendance préalable `hasUnresolvedError` |
| Q4 Disponibilité réelle de `usageMetadata` après un abort de flux | §5.4 Mesure de `fast_tokens_consumed` |
| Q5 Existence de points de mesure pour « question / clarification utilisateur » | §5.2 Signal de surveillance de régression qualité modèle rapide |
| Q6 Charge IO réelle de `shouldConfirmExecute` pour les outils `CONCURRENCY_SAFE_KINDS` | §3.4 Estimation du gain D4             |

### 6.2 Découverte 1 : l'heuristique `hasUnresolvedError` a 32 % d'angle mort pour les outils (impact sur D2)

**Fait** : parmi les 22 outils ayant un chemin d'erreur, **15 (68 %) remplissent correctement le champ `ToolResult.error`** (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-\*, etc., tous les outils IO de base sont présents), **7 (32 %) mettent l'erreur uniquement dans la chaîne `llmContent`** : `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite`, etc.

**Il n'existe pas** de helper unifié `createErrorResult` ; chaque outil implémente indépendamment la construction d'erreur.

**Impact sur la conception** :

- Si le signal de récusation `hasUnresolvedError` de §3.2 vérifie uniquement le champ `ToolResult.error`, **les échecs de ces 7 outils ne déclencheront jamais le retour vers le modèle primaire** — le tour suivant sera encore routé vers le modèle rapide
- Parmi eux, **l'échec de l'outil `skill` mal résumé par le modèle rapide** est un scénario à haut risque (le dépôt contient de nombreux workflows pilotés par skill qui seront affectés)
- La condition « shell et autres outils doivent correctement remplir ToolResult.error (dépendance de qualité des données préalable) » listée dans §3.2 **est trop étroite** : shell est déjà conforme, ce sont les vrais absents comme skill / lsp / todoWrite

**Correction suggérée** : ajouter « **Transformer les 7 outils qui ne transmettent leur erreur que via `llmContent` pour qu'ils remplissent correctement le champ `error`** » comme dépendance dure préalable à D2 (condition préalable §3.2), estimation ~2j ; ne pas accepter le chemin sale utilisant `llmContent.match(/^Error:/i)` comme solution de repli (trop de faux positifs).

### 6.3 Découverte 2 : le coût d'implémentation de l'indicateur `fast_tokens_consumed` a été sous-estimé (impact sur D2 / §5.3)

**Fait** :

- Le chemin d'abort de `turn.ts` (L289-291) fait un `return` direct, **sans bloc finally, ni appel à `stream.return()`** — le « avant l'abort, essayer `stream.return()` pour que le générateur passe par le chemin finally » suggéré par le document §5.4 n'a pas cette entrée dans le code actuel
- La boucle `for await` de `geminiChat.ts:processStreamResponse` n'enregistre le tour qu'à la fin complète de l'itération (L1286) ; un arrêt par abort signifie que le dernier chunk contenant seulement le usage (contenant généralement les métadonnées complètes) **est directement jeté**
- Le chemin principal du chat **n'a aucun cumul de tokens au niveau chunk comme filet de sécurité** ; seul le niveau subagent (`agent.ts:731-744`) a un cumul, non réutilisable
- Conclusion : en cas d'abort, `usageMetadata` **est totalement inaccessible**, on ne peut qu'estimer par `chars/4` (erreur de ±20 %)

**Impact sur la conception** :

- Parmi les trois couches « prioritaire / repli / marquage » de la fin de §5.4, **le chemin « prioritaire » est inaccessible dans le code actuel** — il faut d'abord modifier la structure du générateur `sendMessageStream` pour ajouter un finally, charge de travail d'environ 1j, non mentionnée dans le document de conception
- §5.3 fixe l'objectif « coût en tokens par millier de sessions <70 % » pour la Phase 3, mais si l'indicateur lui-même a une erreur de ±20 %, alors **« 70 % » et « 82 % » tombent dans le bruit de mesure**

**Correction suggérée** :

- Remplacer §5.3 par **un indicateur de tendance**, non utilisé comme gate de release ; utiliser plutôt l'indicateur combiné « taux de `fallback_triggered` des journaux de décision + tendance de `fast_tokens_consumed` dans le même sens »
- Compléter §5.4 : l'implémentation de `fast_tokens_consumed` nécessite d'abord de modifier le chemin d'abort de turn.ts pour ajouter finally + `stream.return()`, comme complément de charge de travail pour §3.2 (+1j)

### 6.4 Découverte 3 : `user_prompt_classification` et le point de mesure « question utilisateur » doivent être créés (impact sur D2 / §5.2)

**Fait** :

- `packages/core/src/followup/` contient déjà `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, mais leur télémétrie (`PromptSuggestionEvent`) enregistre le fait que **« la suggestion système a été acceptée/ignorée »**, pas que « l'utilisateur a posé une question proactive »
- `ChatRecordingService` stocke les messages utilisateur mais **sans étiquette de classification**
- Aucune occurrence de `user_prompt_classification`, aucun motif de question/répétition en chinois ou anglais, aucun mécanisme de type `clarif*` / `intentDetect` dans tout le dépôt

**Impact sur la conception** :

- Le champ `user_prompt_classification: 'query' | 'action' | 'analysis'` du schéma de journal de décision §5.4 **n'a pas de source de données** — il ne peut être déduit de l'existant PromptSuggestionEvent ni lu à partir de ChatRecord
- La fréquence des questions utilisateur « plus de détails » de §5.2, même problème, **le point d'ancrage existant le plus proche `followupState.onOutcome` n'est pas réutilisable**
**建议修正**：

- §3.2 前置条件中追加"用户输入分类器最小实现"（中英文模式匹配，~3d），否则 §5.4 决策日志的 `user_prompt_classification` 与 `requestImpliesFurtherAction` 都缺数据
- 或者**接受**在 Phase 3a dogfood 阶段没有这两个信号，仅靠 `fallback_triggered` 率监控质量回归——成本低但风险高

### 6.5 发现 4：D4 设计内在矛盾——allowlist 与收益归因不对齐（影响 D4 / §3.4）

**事实**：

- `Kind.Read`（read_file）、`Kind.Search`（glob / grep）、`Kind.Fetch`（web_fetch）三类工具的 `shouldConfirmExecute` / `getConfirmationDetails`，**绝大多数继承 `BaseToolInvocation` 默认实现，做零 IO**（read_file / glob / grep 完全没 override，web_fetch 只做 5-10 行字符串解析 URL hostname）
- 真正有 IO 的是 `Edit` / `WriteFile`（`calculateEdit` + `readTextFile` + `Diff.createPatch`，典型 ~20ms），但 §3.4 方案 A 把它们排除出 allowlist 以规避 TOCTOU
- **结果**：留在 allowlist 里的三类工具，prevalidate 与不 prevalidate 工作量基本相同——allowlist 实际拦截的是"唯一有 IO 可省的 Edit"，留下"本来就零成本的工具"

**对设计的影响**：

- §3.4 的"前置 IO 验证"叙事**不成立**：50-100ms 收益的真正来源是 **"stream 完全结束 → 才批量 schedule" 这段调度等待被消除**，与工具端 IO 几乎无关
- 收益归因错误会带来两个问题：
  1. **allowlist 可以更宽**——凡是 idempotent prevalidate 的工具都行，不必绑定 `CONCURRENCY_SAFE_KINDS`
  2. **5-7d 投入难以自洽**——如果真实收益只有调度模型改变的 ~50ms，Edit 又不在 allowlist 里，这笔投入的 ROI 比设计文档暗示的低

**建议修正**：§3.4 重写收益归因——

- 拆分为两部分：(a) 调度模型改变省下的 stream 等待 ~50ms，(b) 工具端 IO 前置可省的工作量 ~0ms（allowlist 内）/ ~20ms（若 Edit 入 allowlist）
- 在 §4.1 综合评估表里把 D4 RT 收益从 "50-200ms" 改为 "30-80ms（方案 A，主要来自调度模型）/ 100-200ms（方案 B，含 Edit）"
- 在 §4.2 路线图中把 D4 进一步降级——纯调度模型改造可独立做，不必强行绑定 prevalidate 概念

### 6.6 对路线图的合并影响

| 章节                          | 原估时 | 验证后估时   | 增量来源                                                                                         |
| ----------------------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------ |
| D2 §3.2 工作量（§4.1 细分表） | 9d     | **14-16d**   | +2d（发现 1 前置工具改造）+1d（发现 2 turn.ts finally 改造）+3d（发现 3 输入分类器，如取硬路径） |
| D4 §3.4 综合评估              | 5-7d   | 5-7d（不变） | 工作量不变，但 **RT 收益归因从"工具端 IO"改为"调度模型"**，投入 ROI 下调                         |
| Phase 3 总时长（§4.2）        | ~3 周  | **~4-5 周**  | D2 工作量上调 + 前置工具改造 PR 单独走 review 周期                                               |

**对原路线图的修正建议**：

1. **保持 D1（P0）和 D3 紧随其后**——本次验证未触及它们的核心假设，ROI 判断不变
2. **D2 启动条件加严**——把发现 1/2/3 的前置工作（共 ~6d）作为 "D2 启动 gate"，未完成不进入 §3.2 前置实验
3. **D4 重新评估优先级**——既然真实收益是调度模型改变而非工具端 IO，要么 (a) 接受 30-80ms 把 D4 降到 P3 后置，要么 (b) 考虑方案 B（Edit + mtime/hash）拿回 100-200ms 但额外 5-7d
4. **不修改 §1.2 单次采样基线**——但 §5.1 P95 一栏在 D1 落地、补完 ≥3 类场景基线之前不写具体数字

### 6.7 验证未覆盖的追问点

以下追问点属于主观判断或作者意图问题，本次验证未通过 subagent 处理，留作后续 design review 讨论：

- D2 实施次序应否后置于 D3（主观次序）
- D1/D3 是否应合并到 Phase 1 一起做（实施策略）
- §3.2 `needsCrossResultReasoning` 阈值 ≥3 是否反向拟合 §1.2 基线场景（作者意图）
- §5.7 关键代码位置表的行号锚点是否应改为符号锚点（文档稳定性）

---

## 7. 浮油评估与下一步（2026-05-26 二次 review）

### 7.1 触发本次重排的事实

§6 验证之后，又发现两个**改变 ROI 判断的事实**：

1. **DashScope `cache_control` 已实装**（`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`）
   - streaming 请求标记 `system + 最后一条 message + 最后一个 tool definition`
   - 命中数据 `cached_tokens` 已采集到 `usageMetadata.cachedContentTokenCount`（`converter.ts:1124-1149`）
   - 这是 prefix cache 机制：Round N+1 自动命中 Round N 写入的前缀
   - **summary 轮恰好是命中前缀最长的一轮**

2. **system prompt 已经稳态**（`prompts.ts` 审计结果）
   - 没有 cwd / timestamp / git status / 文件列表 / LSP 状态等"每 turn 都变"的硬伤
   - `process.cwd()` 仅用作 `isGitRepository()` 开关，不写入 prompt 内容
   - 唯一动态点：`save_memory` 工具触发 / `/model` 切换 / MCP 动态加载（均事件性，低频）

### 7.2 这两条事实改变了 D2 的 ROI 判断

§3.2 文档假设 "fast model 比 primary 快 ~2s"，对照基线是 **primary uncached vs fast uncached**。

但现实运行中 primary 是 **cached**（summary 轮恰好命中最强），所以正确对照是：

> primary cached vs fast uncached

| 路由                          | 估算延迟  | 备注                     |
| ----------------------------- | --------- | ------------------------ |
| primary 命中 80% 前缀 cache   | ~1.8-2.2s | summary 轮的当前实际表现 |
| fast 无 cache（跨模型不共享） | ~1.5-2s   | D2 切换后的实际表现      |

**净差距：几百毫秒，甚至可能 fast 反而慢**。叠加 14-16d 工程成本 + 质量风险 + fallback 浪费，**D2 净收益接近 0 或负**。

§3.2 前置条件**必须新增**：基线测量必须对比 primary **cached** vs fast **uncached**，且 `T_primary_cached < T_fast_uncached × 1.5` 时 D2 不应启用。

### 7.3 候选清单（按浮油性重排）

**真·浮油（立刻动手，< 1d 投入，极低风险，确定收益）**：

| 项                            | 投入  | 收益                              | 操作位置                                                                    |
| ----------------------------- | ----- | --------------------------------- | --------------------------------------------------------------------------- |
| 简洁回复指令                  | 30min | ~2s/summary 轮（输出 token 减半） | `prompts.ts` Final Reminder 段加一句                                        |
| 暴露 cache hit rate telemetry | 0.5d  | 0s 直接，是后续决策 **enabler**   | `cachedContentTokenCount` 已采集，缺暴露；并应识别 `save_memory` 后单独打标 |

**近浮油（等数据决定，0.5-1d 投入）**：

| 项                              | 投入                  | 收益                                    | 决策前置                                                              |
| ------------------------------- | --------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| summary 轮 `tool_choice='none'` | 0.5-1d                | 0.3-1s（sampling 跳过 tool_call token） | 需"是 summary 轮"判定逻辑，错判风险低                                 |
| summary 轮关 thinking           | 1d                    | 0.5-2s                                  | 仅对启用 thinking 的模型有意义（qwen3.5-plus、glm-4.7、kimi-k2.5 等） |
| UI 渲染层 chunk batching        | 0.5d 调研 + 0.5d 实施 | 待验证                                  | 假设：长 summary 的 `useGeminiStream` token 渲染累计开销不小          |

**待调研（可能是大鱼）**：

| 项                                   | 调研投入                 | 潜在收益            | 关键未知                                                                                   |
| ------------------------------------ | ------------------------ | ------------------- | ------------------------------------------------------------------------------------------ |
| ~~DashScope `scope: 'global'` 支持~~ | ~~0.5d 文档 + 0.5d A/B~~ | ~~跨 session 命中~~ | **已调研，结论 (c) 不可行**（见 §7.4 发现 B 调研结果）。此行保留作为决策记录，不要重启调研 |

**中等改造（不算浮油，单独评估）**：

| 项                                | 投入             | 风险 | 收益        |
| --------------------------------- | ---------------- | ---- | ----------- |
| D1 `skipLlmRound`（终态查询场景） | 2-3d             | 中   | 3-4s/终态轮 |
| summary 轮工具结果裁剪（D5 子集） | 2d               | 中   | 1-2s        |
| D3 `Summarizing` 状态             | 3-5d             | 中   | 感知改善 3s |
| system prompt 减肥                | 2-3d 含 A/B 测试 | 中   | 0.5-1s      |

**已废弃方向（不要再做）**：

| 项                                         | 废弃原因                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| D2 fast model 路由                         | 被 DashScope cache 抵消，净收益接近 0 或负             |
| D4 prevalidate                             | 收益归因错（真实仅 ~50ms 来自调度模型），5-7d 投入不值 |
| system prompt 稳定化                       | 已稳态，无事可做                                       |
| 流式提前 terminal（提前 abort 收尾客套话） | 高误判风险，用户感知答案被切断                         |

### 7.4 三个值得展开的新发现

#### 发现 A：`tool_choice='none'` 的真实机制

OpenAI / DashScope API 里 `tool_choice='none'` 不仅是"禁止调工具"——模型 sampling 阶段会**完全跳过 `<tool_call>` 特殊 token 的概率分配**，decoder 直接走自然语言生成路径。收益不在"省一两次 retry"，而在 sampling 本身更快。

#### 发现 B：`scope: 'global'` 在仓库已有 Anthropic 先例

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` 已有 `cache_control: { type: 'ephemeral', scope: 'global' }` 用法。但 `provider/dashscope.ts:288` 标 cache_control 时**没传 scope**：

```typescript
cache_control: { type: 'ephemeral' },   // 没有 scope
```

若 DashScope 服务端识别 `scope: 'global'`：

- system + tools 升级为 global cache（TTL 远大于 ephemeral 的 5min）
- **跨 session 命中**，启动延迟也降
- 单这一条收益可能超过原 D2 全部假设收益

##### 调研结果（2026-05-26，结论：(c) 不可行，关闭此线）

通过查阿里云百炼官方文档 `help.aliyun.com/zh/model-studio/context-cache` 得到的事实清单：

| 问题                   | 结论                                                                                                                                                                                               | 证据                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `scope` 字段支持       | **不支持**。仅识别 `type: 'ephemeral'`，任何 `scope`/`persistent`/`global` 会被 silently dropped                                                                                                   | 官方文档原文："仅支持将 `type` 设置为 `ephemeral`" |
| ephemeral 实际 TTL     | **5 分钟滑动窗口**（命中后重置）                                                                                                                                                                   | 百炼文档明确说明                                   |
| 长 TTL / 全局机制      | **无任何公有云 API 端机制**。无 `persistent` type 值、无独立预上传 API、无 `prompt_cache_key`；唯一"全局持久"产品是 PAI 全局上下文缓存（自部署 + vLLM + 灵骏 + 共享 Redis），与 DashScope API 无关 | PAI 文档                                           |
| 跨 session 共享        | 同账号 + 同模型 + 内容匹配 → 已经命中（这就是 `ephemeral` 已经在做的）；不同账号绝对不共享                                                                                                         | 百炼文档                                           |
| 定价                   | cache write 125%、显式 cache read 10%、**隐式 cache read 20%**（无 `cache_control` 标记也能拿到隐式 20% 折扣）                                                                                     | 百炼定价文档                                       |
| 最小可缓存 prompt      | **1024 tokens**                                                                                                                                                                                    | 百炼文档                                           |
| 模型支持（显式 cache） | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 均显式列出。**qwen3.6-plus 与 qwen3.7-max 同样享受 90% 显式 cache 折扣**        | 百炼模型列表（2026-05-26 重核）                    |

**几条副发现的连带意义**：

1. **TTL 滑动窗口** 对 agent loop 是好消息——loop 内连续调用间隔通常 < 30s，**cache 永远新鲜，不会 5min 失效**
2. **隐式 cache 20% 折扣** 是免费红利——即使没标 `cache_control` 也能拿；但精细控制需要显式
3. ~~`qwen3.6-plus` 未在显式列表~~ —— **更正（2026-05-26）**：经重核，qwen3.6-plus **确实在显式 cache 列表里**，享受 90% 折扣。前一轮报告此处错误，已于本节首张表更正
4. **`dashscope.ts:288` 当前做法已经是 DashScope 公有云 API 的能力上限**——没有继续榨的空间

**对 §7.2 D2 判断的连带加强**：

TTL 滑动窗口意味着 agent loop 内 summary 轮**几乎 100% 命中** primary 的 cache（前几轮刚刚命中过、5min 内）。D2 切 fast model 不仅会打碎累计的 cache 写入链，**还会让 summary 轮从"近 100% 命中"退化为"完全 miss"**——净收益判断比 §7.2 原假设更明确为负。

#### 发现 C：UI 渲染层是被忽视的盲区

§1.2 基线把"框架开销"标为 0.3s（3%），但这是粗估。Ink 7 + React 19.2 在每个 chunk 触发 setState → re-render，长 summary 累计可能 200-500ms。需要查 `useGeminiStream` 怎么处理 token 流，有没有 `requestAnimationFrame` / `useDeferredValue` 合并 chunk。

### 7.5 待数据 checkpoint —— 数据到了该看哪个决策

本节是**这份文档的活动入口**：后续有任何度量数据，对照下表决定该回看哪个决策。

#### Checkpoint 1：cache hit rate 数据出来后

**触发条件**：浮油"暴露 cache hit rate telemetry"上线 ≥3 天，决策日志含 `cached_tokens` / `prompt_tokens` 分布。

**该看的数据**：

- 整体命中率（cached / prompt）的 P50、P90 分布
- 按轮次划分：Round 1 / Round 2 / Round 3 (summary) 各自命中率
- `save_memory` 触发后下一轮命中率（应该接近 0）
- `/model` 切换后下一轮命中率（应该接近 0）

**决策路径**：

| 整体命中率 | 含义                 | 行动                                                                        |
| ---------- | -------------------- | --------------------------------------------------------------------------- |
| > 70%      | 现状已经接近理论上限 | 只做 #1 简洁指令 + 发现 B 调研；其余浮油按需                                |
| 40-70%     | 还有空间但来源不明   | 分析按轮次命中率，找出哪一段在 miss                                         |
| < 40%      | 有动态点在打 cache   | 重新审计 system prompt / userMemory 触发频率；可能 `save_memory` 比预期频繁 |

#### Checkpoint 2：DashScope `scope: 'global'` 文档调研结果 ✅ 已完成（2026-05-26）

**结果**：**完全不识别**。详见 §7.4 发现 B 的"调研结果"段。

**已执行行动**：接受现状，跳过此项。`dashscope.ts:288` 维持现有 `ephemeral` 标记，无需改造。

**后续不要重新启动此调研**——除非 DashScope 官方公告新增持久化机制。

#### Checkpoint 3：UI 渲染层调研结果

**触发条件**：发现 C 调研完成（看 `useGeminiStream` token 流处理 + Ink/React DevTools 实测）。

**决策路径**：

| 结果                               | 行动                                             |
| ---------------------------------- | ------------------------------------------------ |
| 长 summary stream 渲染累计 > 200ms | 改用 batching（`useDeferredValue` 或自定义节流） |
| 渲染开销 < 100ms                   | 关闭此线索                                       |

#### Checkpoint 4：完成"真·浮油"后的二次基线测量

**触发条件**：#1 简洁指令 + Checkpoint 1/2/3 决策完成 ≥1 周。

**该看的数据**：

- 端到端 RT P50 与 §1.2 单次采样基线（13.4s）对比
- summary 轮单独的 P50 / P95
- 用户追问率（如果浮油 A 顺带做了用户输入分类）

**决策路径**：

| 累计节省                     | 行动                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| > 4s（达到 9.6s 端到端 P50） | 评估 D1 `skipLlmRound`（再省 3-4s/终态轮）                                    |
| 2-4s                         | 接受现状，评估 D3 感知改善是否值得做                                          |
| < 2s                         | 重新审视：是否浮油本身被高估，还是有未识别的瓶颈（网络 RTT、provider 端延迟） |

### 7.6 与 §3 各方向的最终判定

基于 §6 验证 + 本节 ROI 重排：

| 方向                 | §3 原优先级 | 本节判定                             | 理由                                               |
| -------------------- | ----------- | ------------------------------------ | -------------------------------------------------- |
| D1 工具后置指令      | P0          | **P0 保留**，但等浮油完成后再评估    | ROI 仍然好，但不再"立刻就做"——先把更便宜的浮油拿掉 |
| D2 summary fast 路由 | P1          | **Defer / Won't Fix**                | 被 DashScope cache 抵消，14-16d 投入换接近 0 收益  |
| D3 展示解耦          | P1          | **保留为可选**，看 Checkpoint 4 数据 | 感知改善确定，但绝对 RT 不变，依赖用户行为         |
| D4 流式提前调度      | P2          | **Defer**                            | 收益归因错，真实 ~50ms 不值 5-7d                   |

### 7.7 推荐执行顺序

**Day 1**（可单人单日完成）：

- ✅ `prompts.ts` 加简洁回复指令（30min）
- ✅ `cachedContentTokenCount` 暴露到 telemetry + `save_memory` / `/model` 切换打标（0.5d）
- ✅ 启动发现 B 调研：DashScope `scope: 'global'` 文档查询 + 现有 Anthropic 用法对照（0.5d）

**Day 2-3**：

- 收第一批 cache hit rate 数据
- 启动发现 C 调研：`useGeminiStream` 的 React 渲染路径
- 根据 Checkpoint 2 决定要不要做 `scope: 'global'` 改造

**Week 1 末**：

- Checkpoint 1 数据决策（看分布）
- 决定要不要做 `tool_choice='none'` / 关 thinking（根据 hit rate 数据）

**Week 2-3**：

- Checkpoint 4 二次基线测量
- 决定是否启动 D1（最大的非浮油项，3-4s/终态轮）

**始终不做**：D2 / D4 / system prompt 稳定化。

### 7.8 `prompts.ts` 动态内容审计（2026-05-27）

§7.1 给出 "system prompt 已稳态" 的结论时只做了粗略 grep。本节是对 `packages/core/src/core/prompts.ts`（1169 行）的系统性审计，列清单作为后续 cache 命中率分析与浮油决策的依据。

**审计方法**：枚举所有 `${...}` 插值表达式、IIFE、`process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*` 调用，对每一处判断"在同一 session 内是否会变化"。

#### 完全没有（常被怀疑的硬伤）

| 候选                               | 代码事实                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`        | 全文 **零次出现**（`rg` 全无匹配）                                                  |
| `Math.random()`                    | **零次出现**                                                                        |
| `process.cwd()` 值写入 prompt      | 仅 L366 `if (isGitRepository(process.cwd())) { ... }`，**值不写入字符串**，只作开关 |
| git status / git branch 子进程调用 | **零次**，git 段是静态指导文本                                                      |
| 当前文件列表 / 项目结构注入        | **零次**                                                                            |
| LSP 状态 / 错误数                  | **零次**                                                                            |
| 用户输入历史                       | **零次**（history 走 messages，不在 system）                                        |

#### 启动时一次，session 内不变

| 位置     | 内容                                                                                             | 何时可能变                |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| L190     | `process.env['QWEN_SYSTEM_MD']` 决定 basePrompt 来源（默认 vs 用户 system.md）                   | 进程内不变                |
| L342-343 | `process.env['SANDBOX']` 决定 sandbox 段选哪一版（Seatbelt / Sandbox / Outside）                 | 进程内不变                |
| L366     | `isGitRepository(process.cwd())` 决定 git 段是否插入                                             | cwd 同 session 内通常不变 |
| L871     | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` 决定 tool call 风格（qwen-coder / qwen-vl / general） | 进程内不变                |

#### 事件触发（低频）

| 参数                                              | 触发条件                                          | 频率估计           |
| ------------------------------------------------- | ------------------------------------------------- | ------------------ |
| `userMemory`（`getCoreSystemPrompt` 第 1 参）     | `save_memory` 工具 / `/memory refresh` / 扩展加载 | 0-3 次/session     |
| `model` 名（影响 `getToolCallExamples` 选哪一支） | `/model` 切换                                     | 罕见               |
| `appendInstruction`                               | 配置项，session 内基本不变                        | 几乎从不           |
| `deferredTools`（`buildDeferredToolsSection`）    | MCP 工具动态加载                                  | session 启动期居多 |

#### 一个隐蔽的小坑

L207-209：若设置了 `QWEN_SYSTEM_MD` env，**每次** `getCoreSystemPrompt` 都会 `fs.readFileSync(systemMdPath)`：

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- 文件不变时内容稳定 → cache 命中不受影响
- 但每轮 LLM 调用都有一次同步 IO（默认 `.qwen/system.md`，网络挂载文件会更慢）
- 不影响本节"cache 友好性"结论，仅作为已知性能小坑记录

#### 连带结论

1. **system prompt 在稳态 session 内每次产出 byte-for-byte 一致** → DashScope ephemeral cache key（基于内容 hash）整段稳定 → **system 段 cache 命中率几乎 100%**
2. 唯一打 cache 的事件是 `save_memory`——核心功能，不能为 cache 让路
3. **浮油 #1（简洁回复指令）的代价分析**：把指令加到 Final Reminder 段（L389-390）→ system prompt 内容改变一次 → **首次请求 cache miss（一次性预热成本），之后所有请求继续命中**
4. **§7 的 "system prompt 稳定化" 已废弃判断得到正式证据支持**——不仅没必要做，连"理论上做了能进一步降低 cache miss 率"都不成立，因为本来就 ≈ 0
5. 本审计可作为后续相关讨论的引用基线，避免重复 grep；若 prompts.ts 有大改动，本节需要同步更新
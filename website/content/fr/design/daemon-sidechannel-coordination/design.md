# Coordination side-channel du démon — Conception (A1 / A2 / A4 / A5)

> Cible `daemon_mode_b_main` (selon la stratégie de branchement #4175). Auteur : 秦奇. Date : 2026-05-25. Révisé : 2026-05-27 (v13 — doc zombie-gap, contrat reconciliation_failed, spec availableCommands, §7 atomic-coupling, §8 bounded-call-count).
> **Docs uniquement / design-first.** A4 implémenté + approuvé (#4539) ; A1 implémenté (#4546).
>
> Source : audit de synchronisation temps réel multi-clients (2026-05-24) + revue post-merge de la PR #4484 (les suivis de la **série A**). Les suivis de correction de bugs/nettoyage de la même revue sont livrés séparément (PR #4510) et sont **hors périmètre ici**.

## Changelog

### v12 (2026-05-27) — neuvième tour de revue (signature du helper + garde structurelle)

- **Le helper `publishModelSwitched` accepte désormais `originatorClientId` (Critique).** Le roundtrip du bridge (`bridge.ts:1172`, `:2883`) et `applyModelServiceId` passent tous deux `originatorClientId` dans chaque événement `model_switched`. La signature `publishModelSwitched(entry, modelId)` de la v11 omettait cela, forçant les implémenteurs soit à ignorer silencieusement l'attribution, soit à contourner le helper. Corrigé : la signature est maintenant `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`. Le roundtrip du bridge et `applyModelServiceId` passent le `originatorClientId` résolu ; la promotion demux et la corrective de réconciliation n'en passent aucun.
- **La règle de non-récursion dispose désormais d'une application structurelle.** La v11 reposait sur la discipline du graphe d'appels (contractuelle — « ne pas passer par le hook `.finally` »). La v12 ajoute un flag `reconciliationInFlight: boolean` par session, mis à `true` avant la lecture asynchrone et effacé après. Si le `.finally` de settle du roundtrip se déclenche alors que le flag est déjà à `true`, il log et skip. Cela fait de la non-récursion un invariant, indépendamment des futurs refactoring.
- **Format de log d'observabilité étendu avec des compteurs de génération.** Le format est maintenant `[reconcile] session=<id> trigger=… baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=…`. Renommé `published` → `baseline` (sur le chemin d'échec, aucun `model_switched` n'a été publié, donc "published" était trompeur). La phrase sur la non-récursion a été retirée de la ligne d'observabilité (couverte par le paragraphe dédié ci-dessus — un seul point de maintenance).
- **Modes de défaillance de l'invariant de lecture fraîche corrigés.** Le scénario "stale-but-equal" (périmé mais égal) était auto-contradictoire ; remplacé par deux modes de défaillance précis : (1) réponse périmée correspondant à `entry.currentModelId` → faux "converged" (divergence réelle manquée) ; (2) réponse périmée divergeant de `entry.currentModelId` → fausse "corrective" écrasant une valeur plus récente.
- **Ordre des événements consommateurs sur le chemin d'échec documenté.** Sur le chemin d'échec, les consommateurs peuvent voir `model_switch_failed` → `model_switched(A)` (le modèle en timeout est effectivement appliqué). Le §2.2 note cet ordre et recommande aux consommateurs de traiter `model_switched` comme toujours faisant autorité, indépendamment des événements d'échec précédents.
- **Plan de test du §8 étendu :** (1) règle de non-récursion : assert que `getSessionContextStatus` est appelé exactement une fois par réconciliation, pas de second `.finally` planifié après la corrective ; (2) cas converged du chemin d'échec (l'agent n'a PAS appliqué le modèle en timeout → `action=converged`) ; (3) assertion de correction de generation-skip sur les valeurs `gen_before`/`gen_after`.
- **Résultats de réconciliation du §2.2 : terminologie alignée** — le bullet _converged_ utilise `entry.currentModelId` (le modèle actuel du bus), en cohérence avec le langage du contrat de la v11.

### v11 (2026-05-27) — huitième tour de revue (durcissement du contrat de réconciliation)

- **Baseline de réconciliation du chemin d'échec clarifiée (Critique).** Sur le chemin d'échec (`model_switch_failed`), aucun `model_switched` n'a été publié — le bus et `entry.currentModelId` conservent tous deux la valeur **pré-roundtrip**. La réconciliation compare la lecture faisant autorité avec `entry.currentModelId` (et non "le modèle publié" de manière générique). Ajout d'un langage explicite + une expansion de sous-scénario _failure-path trigger_ au §8.
- **Helper `publishModelSwitched` — mécanisme d'application pour l'invariant de génération (Critique).** Un unique helper `publishModelSwitched(entry, modelId)` met à jour de manière atomique (en un tour synchrone) : (1) `entry.currentModelId`, (2) incrémente `entry.modelPublishGeneration`, (3) publie `model_switched` sur le bus. **Les quatre sites de publication** (roundtrip du bridge, `applyModelServiceId`, promotion demux, corrective de réconciliation) passent par lui. Aucun autre chemin de code ne peut publier `model_switched` directement. Invariant de test : après chaque chemin de code, assert que la génération a avancé d'exactement 1.
- **Invariant de lecture fraîche documenté (Critique).** La lecture `getSessionContextStatus` utilisée par la réconciliation DOIT retourner une valeur fraîche à un instant t — elle DOIT contourner tout cache de réponse, déduplication de requête ou coalescing en cours. Ajouté au contrat du §2.2. (En pratique : `extMethod` est un nouvel appel JSON-RPC à chaque invocation — aucun cache middleware n'existe aujourd'hui — mais le contrat est maintenant explicite.)
- **La corrective NE DOIT PAS redéclencher la réconciliation (Critique).** La corrective de réconciliation est un `publishModelSwitched` local et ne planifie pas de réconciliation ultérieure. L'implémentation doit s'assurer que le chemin de la corrective ne passe pas par le hook `.finally` de settle du roundtrip. Ajouté à l'observabilité du §2.2 + règle de non-récursion explicite.
- **Bullet de test du §8 pour l'assertion de génération étendu :** chaque site de publication `model_switched` (y compris la corrective de réconciliation) met à jour `entry.currentModelId` ET incrémente `entry.modelPublishGeneration` ; assert que la génération a avancé d'exactement 1 après chacun.

### v10 (2026-05-27) — septième tour de revue (TOCTOU de réconciliation + retry + tests)

- **TOCTOU de réconciliation (Critique) → garde de publish-generation.** Même la lecture faisant autorité de la v9 a une fenêtre : après le settle, un `/model C` concurrent en session peut promouvoir `model_switched(C)` pendant que la lecture asynchrone est en vol ; la lecture (émise plus tôt) retourne la valeur pré-C B ; la réconciliation émet alors `model_switched(B)`, écrasant C. **Correctif :** ajouter un `modelPublishGeneration` par session, incrémenté à chaque publication `model_switched` (bridge / promotion demux / corrective de réconciliation). La réconciliation capture la génération **avant** la lecture asynchrone et **skip la corrective si la génération a avancé** pendant la lecture (une publication faisant autorité plus récente est déjà arrivée). La réconciliation se déclenche également sur les chemins de succès et d'échec (`.finally` sur le roundtrip), car le cas de timeout/échec est exactement celui où elle est le plus nécessaire.
- **Read-error n'est pas silencieusement terminal → retry borné + événement.** Une défaillance transitoire de `getSessionContextStatus` laisserait sinon le bus définitivement divergent. Ajout de 1 à 2 retries bornés (backoff court) ; si tous échouent, émettre un événement bus `reconciliation_failed` pour que les clients puissent alerter / pull, et logger `action=read-error`.
- **L'énumération des sites de publication du §2.3 inclut désormais la corrective de réconciliation** (elle doit mettre à jour `entry.currentModelId` + incrémenter la génération, sinon le cache diverge du bus après une correction).
- **Test de staleness du §8 corrigé** — il contredisait la v9 (il attendait un drop basé sur la valeur de A quand cache=B, mais la dédup de la v9 ne drop que le dup de _valeur égale_). Remplacé par : (1) drop de dup redondant (`current_model_update(A)` quand le cache est déjà A), (2) race de timeout gérée par la réconciliation (A≠B promeut, la réconciliation converge). Plus un test `reconciliation-skips-on-newer-promotion`.
- **Q3 du §10 élevé :** router le `/model` en session via `modelChangeQueue` (sérialiser à la source) est la conception à long terme sans race ; la pile suppress/dedup/reconcile est la solution intérimaire d'ici là.

### v9 (2026-05-27) — correction du mécanisme de réconciliation/staleness (trouvé lors de la planification du durcissement de A1)

- **Le "la réconciliation lit le cache du §2.3" de la v8 était insuffisant.** Le cache n'est mis à jour qu'aux sites de publication, mais un changement concurrent en session que le demux drop (fenêtre de suppression) n'est jamais publié — le cache ne peut donc pas l'observer. Une réconciliation lisant le cache verrait la valeur que le bridge vient de publier, jugerait "pas de divergence", et échouerait à corriger → exactement le bug de divergence permanente qu'il existe pour prévenir.
- **Correctif (§2.2) : la réconciliation effectue une lecture post-settle faisant autorité.** Après qu'un roundtrip de modèle du bridge a settled, le bridge lit le **vrai** modèle actuel de l'agent via `getSessionContextStatus` (`bridge.ts:2784`, `extMethod` asynchrone) et émet un `model_switched` correctif s'il diffère de ce qu'il a publié. C'est le backstop de l'agent-en-tant-que-source-de-vérité. C'est asynchrone, mais s'exécute **post-settle (pas dans le demux)**, donc le contrat de bloc synchrone du §5 ne s'applique pas — cette contrainte concerne uniquement les chemins de lecture snapshot/staleness.
- **Vérification de staleness (§2 point 4) recadrée en best-effort + réconciliation comme backstop faisant autorité.** La comparaison de valeurs seule ne peut pas distinguer une notification tardive périmée d'un nouveau switch vers le même id (un problème d'ordre distribué). Ainsi, le demux ne drop que le cas non ambigu (un `current_model_update` dont le `currentModelId` est déjà égal à `entry.currentModelId` — un dup redondant) ; la race de timeout (un changement antérieur en timeout correspond toujours à un roundtrip de bridge settled) est intercepté de manière faisant autorité par la réconciliation du §2.2. Pas de compteur de séquence côté agent nécessaire.
- **Rôle du cache du §2.3 restreint :** source synchrone pour le snapshot de A5 et la dédup demux best-effort — PAS la source de vérité pour la réconciliation (c'est la lecture faisant autorité). Le cache reste correct pour A5 car, après la réconciliation, la dernière valeur publiée EST la vérité de l'agent.

### v8 (2026-05-26) — sixième tour de revue (1×Critique sur A5 + suggestions)

- **Cache d'état du bridge (§2.3, nouveau) — le mécanisme unificateur.** La vérification de staleness (§2 point 4), la réconciliation du §2.2, ET le contrat de snapshot synchrone de A5 avaient tous besoin du "modèle/mode actuel de l'agent", mais le bridge n'avait pas d'accesseur synchrone (seulement une lecture de statut `extMethod` asynchrone, ce qui rouvre la race). Ajout de `currentModelId` / `currentApprovalMode` / `availableCommands` à `SessionEntry`, mis à jour **synchroniquement à chaque site de publication** (`model_switched` à `bridge.ts:2883`/`:1172`, `approval_mode_changed` à `:2979`, les promotions demux) et initialisés à partir de la réponse ACP `createSession`/`loadSession`. Les trois mécanismes lisent désormais ces champs sync — satisfaisant le contrat de bloc unique synchrone du §5 par construction.
- **Cela supprime également le problème de schéma ACP `previousModeId` de A2 :** le `CurrentModeUpdate` de l'ACP n'a que `currentModeId` (pas de champ `previousModeId` — même contrainte d'union externe que la v7 a rencontrée pour A1). Le bridge n'a plus besoin que l'agent envoie `previous` : il le déduit du `entry.currentApprovalMode` en cache (la valeur _avant_ ce changement). Idem pour A1. Ainsi, aucune notification ne transporte de champ `previous*`.
- **Point 2 du §1.1 dé-stalé** — scindé en 2a (A1 `extNotification`) / 2b (A2 `sessionUpdate`) ; la v7 avait corrigé §2/§2.1/§6/§7 mais avait manqué le §1.1.
- **§2.1 : `scope` intégré dans le payload promu `approval_mode_changed`** (`{sessionId, previous, next, persisted, scope}`) ; clarification de sa relation avec `persisted`.
- **Observabilité de la réconciliation du §2.2** — `[reconcile] session=… published=… actual=… action=corrected|converged|read-error` + gestion explicite de read-error.
- **Nom de la méthode extNotification épinglé** à `qwen/notify/session/model-update` (correspond à #4546) + note indiquant que la garde early-return doit devenir un dispatch.
- **Application de la suppression du dual-emit** — `TODO(dual-emit-removal)` sur le site + une issue de suivi dans le §7.
- Correction du §0 ("two demux insertion points"), de la cross-ref §3.4→§3-point-4, et expansion du §8 avec les scénarios staleness-drop / reconciliation-corrective / cross-axis-non-suppression / dual-emit / extNotification-transport.

### v7 (2026-05-26) — correction de faisabilité au début de l'implémentation (transport A1)

- **A1 ne peut pas utiliser un `sessionUpdate` `current_model_update` — ce type n'existe pas dans l'ACP.** Vérifié au début de l'implémentation : `SessionUpdate` est le type externe `@agentclientprotocol/sdk` ; `acp.d.ts` définit `current_mode_update` (2 occurrences) mais **`current_model_update` (0 occurrence)**. On ne peut pas ajouter une variante à l'union externe spécifiée. Le "ajouter un `sessionUpdate` `current_model_update`" des v1–v6 (et l'"Alternative" du §2 qui rejetait `extNotification` par symétrie) était faux.
- **Transport A1 corrigé : l'agent émet le changement de modèle en session via `BridgeClient.extNotification()`** (`bridgeClient.ts:491`, le side-channel agent→bridge existant utilisé aujourd'hui pour les guardrails MCP) — PAS un `sessionUpdate`. Le demux A1 se trouve donc dans **`extNotification()`**, tandis que le `current_mode_update` de A2 (un vrai `sessionUpdate` ACP) est demuxé dans **`sessionUpdate()`**. A1 et A2 utilisent des transports + points d'insertion différents — une nouvelle asymétrie, désormais documentée.
- Effet net sur le reste de la conception : les règles du demux (mapping de payload, suppress par type, vérification de staleness, drop-when-suppressed, observabilité) restent inchangées dans l'esprit ; seul le point d'insertion de A1 passe de `sessionUpdate()` à `extNotification()`, et A1 n'a besoin d'aucun changement de spec ACP.
- **C'est pourquoi design-first est important :** le bloqueur est apparu dès la première ligne de l'implémentation de A1 ; changer le transport dans la doc est peu coûteux, un cast sur l'union externe `SessionUpdate` aurait été un type-lie latent.
### v6 (2026-05-26) — cinquième tour de revue (wenshao 2×Critique + 4×Suggestion)

- **Timeout-race + changement intermédiaire (Critique) :** "l'événement le plus récent fait autorité" était incorrect lorsqu'un changement B s'intercale — un `current_model_update(A)` tardif et obsolète aurait été promu après `model_switched(B)`. Remplacé par une **vérification d'obsolescence (staleness check)** : le demux ne promeut un `current_model_update` que si son `currentModelId` est égal au modèle actuel réel de l'agent au moment de la promotion ; les notifications obsolètes sont ignorées. §2 point 4 / §2.1.
- **`previousModeId` rendu OBLIGATOIRE (Critique) :** le normaliseur SDK `normalizeApprovalModeChanged` (`normalizer.ts:754`) exige `previous`, sinon il ignore l'événement avec un `fallbackDebug`. Un `previousModeId` optionnel aurait englouti silencieusement les changements de mode d'approbation en session. §3.
- **La suppression est désormais par type de changement, et non par session :** un aller-retour (roundtrip) de modèle ne doit pas supprimer un `current_mode_update` en session (et vice-versa). §2.1.
- **Payload de `current_model_update` :** suppression de l'`authType?` indéfini (données mortes — `model_switched` est `{sessionId,modelId}`) ; `previousModelId` reste optionnel (le normaliseur `model_switched` n'a besoin que de `modelId`). §2.
- Correction de deux erreurs de texte/références croisées qui indiquaient `current_mode_update` (A2) au lieu de `current_model_update` (A1). §2 wire/compat, §6.

### v5 (2026-05-26) — quatrième tour de revue (wenshao 2×Critique + 8×Suggestion)

- **Dérive concurrente de `/model` en session (Critique) → règle de réconciliation.** L'abandon en cas de suppression peut faire perdre un `/model B` en session qui se déclenche pendant un aller-retour `setSessionModel(A)` du bridge (le `/model` en session contourne `modelChangeQueue`), laissant le bus sur A alors que la session exécute B. Ajout de la §2.2 : à la fin de l'aller-retour, le bridge se réconcilie — il relit le modèle actuel de l'agent et émet un `model_switched` correctif s'il diverge de ce qu'il a publié.
- **Verrouillage IDE-companion (Critique) → transition à double émission sur une version.** La promotion ne peut pas basculer de manière atomique (canaux de livraison daemon vs Marketplace), et le dispatch en amont (`daemonIdeConnection.ts`, `DaemonChannelBridge.ts`) ignore les types d'événements inconnus avant qu'ils n'atteignent le gestionnaire. Ajout d'une **fenêtre de transition à double émission** (publication à la fois du `session_update` générique ET de l'événement nommé promu pour une version) et énumération des sites de dispatch en amont comme affectés (§2.1, §6).
- **Mapping du payload `model_switched` spécifié** — `currentModelId → modelId`, enveloppe `sessionId → data.sessionId` ; sans cela, le validateur SDK (`events.ts:1910`, qui exige un `modelId` non vide) rejette chaque événement promu (A1 non fonctionnel). §2.1.
- **Observabilité du demux requise** — log structuré à chaque point de décision (promu / ignoré / supprimé / générique). §2.1.
- **Correction sur `replay_complete`** — il **existe** bien (`eventBus.ts:444`, livré par la PR fusionnée #4484) ; le "zéro correspondance" du relecteur portait sur une arborescence obsolète. La phase 2 de A5 dépend du nouveau frame `session_snapshot`, et non de l'introduction de `replay_complete`. §5/§7.
- **Le premier attachement ne synthétise plus `replay_complete{0}`** (cela élargirait le contrat de cet événement pour les consommateurs existants "replaying→live") — le snapshot est auto-délimité lors du premier attachement. §5.
- **Capture à l'émission renforcée** — les lectures des champs du snapshot + la publication DOIVENT former un bloc synchrone unique (pas de `await` entre les deux), sinon la fenêtre d'écrasement obsolète se rouvre. §5.
- **Modèle de migration des helpers + Q3 résolue** (conservation du contournement `extMethod` — §1.1 tient) ; test de distinction A4 ajouté (fait dans #4539). §3, §8, §9.

### v4 (2026-05-26) — troisième tour de revue (wenshao 2×Critique + 9×Suggestion, Copilot 5×)

- **Point d'insertion du demux corrigé** — le forwarding générique `sessionUpdate → session_update` se trouve dans `packages/acp-bridge/src/bridgeClient.ts:397` (`BridgeClient.sessionUpdate()`), **et non** `bridge.ts:352` (c'est le prompt-echo). Le hook demux de la §2.1 se trouve dans `bridgeClient.ts`. Ajout d'une **troisième règle demux** : une promotion bloquée par un aller-retour en cours est **ignorée**, et non publiée en tant que `session_update` générique (sinon l'événement faisant autorité du bridge + le wrapper générique créeraient un double signal).
- **`approvalModeQueue` n'existe pas encore** — il est livré dans la PR #4510. La fenêtre de suppression de A2 dépend d'un tracker en cours par session, donc A2 est maintenant marqué comme un **prérequis strict de #4510** (§3, §7), et non une simple "coordination".
- **Le chemin HTTP A2 n'émet aucune notification agent** (il contourne `Session.setMode` via l'`extMethod`) → le bridge est le **seul** émetteur à cet endroit ; "suppression pendant l'aller-retour" s'applique uniquement au chemin du **modèle**. §1.1 / §9 corrigés.
- **Le demux de l'étape 2 ne couvre que `current_model_update`.** La promotion de `current_mode_update` est reportée à l'étape 3 (nécessite `previousModeId`) ; en attendant, il continue de circuler en tant que `session_update` générique (pas de régression).
- **Écrasement obsolète du snapshot A5 corrigé** — capture du snapshot **au moment de l'émission (après `replay_complete`)**, et non au moment de l'abonnement, afin qu'un delta live livré pendant la replay ne soit pas écrasé par un snapshot obsolète. Ordre du premier attachement défini.
- **Pas "additif partout"** — la promotion de `current_mode_update` est un changement synchronisé (lockstep) ; `packages/vscode-ide-companion/.../qwenSessionUpdateHandler.ts:177` est un consommateur affecté nommé.
- **Point de capture de `previousModeId` spécifié** ; généralisation des helpers détaillée ; description du scope de persistance corrigée (`getPersistScopeForModelSelection` → workspace ou user) ; énumération de sécurité complétée (`resolveTrustedClientId`) ; plan de test + ancres corrigés.

### v3 (2026-05-26) — deuxième tour

Reformulé selon le modèle à autorité du bridge (§1.1, et non émetteur unique) ; A1 trois sites de publication + exception `model_switch_failed` + timeout-race ; décision explicite de miroir workspace pour A1 ; `previousModeId` ; A4 expose les deux champs SDK ; snapshot A5 après `replay_complete` ; tests étendus.

### v2 (2026-05-26) — premier tour

Asymétrie A1/A2 ; contrat demux §2.1 ; tableau §9 ; `pendingPermissionIds` de A5 supprimé ; hygiène des ancres ; `voterClientId` optionnel.

---

## 0. Périmètre et non-objectifs

Quatre lacunes de coordination d'état via canal latéral où un changement d'état de session sur un chemin est invisible pour les autres clients connectés (ou les sessions pairs) :

| #      | Résumé                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | Le changement de modèle en session (`/model`, plan-mode) n'atteint jamais le bus.                                                                                        |
| **A2** | Le changement de mode d'approbation en session (`setMode`) n'émet aucun événement ; le chemin HTTP utilise un point d'entrée agent différent ; la visibilité workspace vs persist n'est pas claire.      |
| **A4** | `permission_resolved.originatorClientId` porte le _votant_, tandis que `permission_request.originatorClientId` porte l'origine du prompt — ambigu.    |
| **A5** | Un client se connectant via `Last-Event-ID` obtient la replay en anneau + le tail live, mais aucun snapshot du modèle actuel / mode d'approbation / commandes ; il doit émettre des requêtes supplémentaires. |

Non-objectifs : echo de contenu utilisateur multimodal (PR #4353 §D), la correction de la course A3 (PR #4510), l'anti-falsification de clientId (A6), le transport streamable-HTTP (#4472).

**Convention d'ancrage :** chemins complets depuis la racine du repo.

- **`packages/acp-bridge/src/bridgeClient.ts`** — le client ACP→bus ; `sessionUpdate()` et `extNotification()` transfèrent les notifications agent vers l'EventBus (les **deux** points d'insertion du demux — A2 dans `sessionUpdate()`, A1 dans `extNotification()` ; voir §2.1).
- **`packages/acp-bridge/src/bridge.ts`** — l'orchestrateur de 3923 lignes (méthodes de contrôle HTTP, sites de publication). `packages/cli/src/serve/httpAcpBridge.ts` est un shim de ré-exportation de 101 lignes — ce n'est pas une cible d'ancrage.
- **`packages/acp-bridge/src/permissionMediator.ts`** — vote/résolution des permissions.
- **`packages/cli/src/acp-integration/acpAgent.ts`** / **`.../session/Session.ts`** — agent + session.

---

## 1. Contexte — l'invariant de coordination du canal latéral

Le daemon diffuse les deltas de transcript et les changements de contrôle initiés par la route HTTP (`model_switched`, `approval_mode_changed`). La lacune : **le même changement logique a deux chemins d'entrée et seul le chemin HTTP diffuse** pour les changements slash/plan-mode.

`current_mode_update` existe aujourd'hui (`Session.ts:1645` ; helper `sendCurrentModeUpdateNotification` dans `Session.ts:1625`) mais n'est câblé qu'aux chemins de confirmation d'outil — `exit_plan_mode` (`Session.ts:2160`) et `ProceedAlways` de l'outil d'édition (`Session.ts:2168`) — et non au `Session.setMode`/`setModel` générique. Il n'existe pas de type `current_model_update`. Les deux circulent aujourd'hui vers le bus via `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`) en tant que **`session_update` générique** sans demux de sous-type.

### 1.1 Modèle de coordination (la décision structurelle)

Le modèle v1 "l'agent est l'émetteur unique ; le bridge abandonne sa publication" a été **rejeté** — le bridge possède la sérialisation (`modelChangeQueue`), la gestion des timeouts, `model_switch_failed`, et la distinction persist/workspace. Modèle adopté :

1. **Le bridge reste l'émetteur faisant autorité pour les changements qu'il pilote** (HTTP `setSessionModel`/`setSessionApprovalMode`, `applyModelServiceId` au moment de l'attachement) — logique de sérialisation/timeout/échec/persist inchangée.
2. **Les changements en session qui contournent le bridge** reçoivent une nouvelle notification agent que le bridge démultiplexe (demux) (§2.1), via **différents transports** (v7) :
   - **2a. A1 (modèle) :** `Session.setModel` émet `current_model_update` via le canal latéral agent→bridge **`extNotification`** (PAS un `sessionUpdate` — cette union ACP n'a pas de variante modèle). `BridgeClient.extNotification()` le démultiplexe → `model_switched`.
   - **2b. A2 (mode d'approbation) :** `Session.setMode` émet `current_mode_update` en tant que véritable ACP **`sessionUpdate`**. `BridgeClient.sessionUpdate()` le démultiplexe → `approval_mode_changed`.
3. **Suppression pendant l'aller-retour — chemin du modèle uniquement.** Le chemin HTTP du **modèle** passe par `Session.setModel` (`acpAgent.ts:935`), donc la notification agent se déclenchera bel et bien là-bas en plus de la publication du bridge ; le demux supprime la promotion pendant qu'un aller-retour de modèle du bridge est en cours. Le chemin HTTP du **mode d'approbation** ne passe **pas** par `Session.setMode` (il utilise l'`extMethod`, `acpAgent.ts:2228`), donc aucune notification agent ne s'y déclenche — le bridge est le seul émetteur et il n'y a rien à supprimer. La suppression n'a de sens que pour le chemin du modèle.

---

## 2. A1 — changement de modèle en session sur le bus

### Problème

`Session.setModel` (`Session.ts:1580`) → `config.switchModel()` (`:1601`), pas de `sessionUpdate`. `model_switched` est publié depuis trois sites côté bridge : `bridge.ts:2883` (`setSessionModel`), `bridge.ts:1172` (`applyModelServiceId`), et aucun pour la session en cours — c'est la lacune.

### Design proposé

1. **Transport : `extNotification`, pas un `sessionUpdate` (v7).** `current_model_update` n'est **pas** une variante ACP `SessionUpdate`. Ainsi, `Session.setModel`, après la résolution de `switchModel` (**succès uniquement**), émet via le canal latéral agent→bridge **`extNotification`** avec le **nom de méthode entièrement qualifié `qwen/notify/session/model-update`** (correspondant à la convention existante `qwen/notify/session/*` ; impl dans #4546) et le payload `{ v:1, sessionId, currentModelId }`. Pas de `previousModelId` / `authType` (le bridge dérive `previous` depuis son cache d'état §2.3 ; `model_switched` est `{sessionId,modelId}`). **Note d'implémentation :** la garde de retour anticipé actuelle de `BridgeClient.extNotification()` (`if (method !== 'qwen/notify/session/mcp-budget-event') return;`) doit devenir un dispatch de méthode pour que le gestionnaire de mise à jour du modèle soit atteignable (fait dans #4546).
2. **`BridgeClient.extNotification()` (`bridgeClient.ts:491`) démultiplexe (demux)** la notification `current_model_update` → `model_switched` (§2.1), **uniquement lorsqu'aucun aller-retour de modèle du bridge n'est en cours** pour cette session. (Le `current_mode_update` de A2 reste un vrai `sessionUpdate`, démultiplexé dans `sessionUpdate()` — voir §2.1.)
3. **`model_switch_failed` reste uniquement côté bridge** — `Session.setModel` lève une exception sans notification ; le bridge continue de le publier sur les deux chemins d'échec.
4. **Timeout-race (abandon demux au mieux + réconciliation faisant autorité en dernier recours — v9).** Le `withTimeout` du bridge (`bridge.ts:2844-2849`) peut rejeter (en publiant `model_switch_failed(A)`) pendant que l'appel ACP de A continue de s'exécuter (FIXME `bridge.ts:2836-2840`). Si un changement B réussit ensuite (`model_switched(B)`) et que l'appel de A se termine enfin, le `current_model_update(A)` tardif de A ne doit pas faire de A l'état final apparent. **La comparaison de valeurs à elle seule ne peut pas trancher** (un A obsolète tardif et un nouveau basculement vers A semblent identiques — c'est un problème d'ordre distribué). Ainsi : le demux effectue une **déduplication au mieux** (ignore un `current_model_update` dont le `currentModelId` est déjà égal à `entry.currentModelId` — une opération nulle redondante), et la **correction faisant autorité provient de la réconciliation §2.2** : un changement antérieur ayant expiré correspond toujours à un _aller-retour de bridge terminé_, ce qui déclenche une lecture faisant autorité post-terminaison qui republie le vrai modèle de l'agent. Aucun compteur de séquence côté agent n'est requis.
**Écart résiduel — roundtrip zombie (v13).** La réconciliation couvre le _premier_ règlement (le timeout), mais un appel ACP zombie qui se termine **après** que la réconciliation a déjà déclenché `action=converged` N'EST PAS couvert : l'agent applique le modèle en timeout tardivement → émet `current_model_update(A)` → le demux le promeut (pas de roundtrip en cours, pas un doublon) → le bus revient silencieusement à A, contredisant le changement réussi de l'utilisateur vers B. La solution à long terme est un signal d'annulation ACP (le FIXME existant dans `bridge.ts:2836-2840`). En attendant, il s'agit d'une **race condition résiduelle connue** sous la condition étroite suivante : le timeout se déclenche, la réconciliation converge (l'agent n'a pas encore appliqué), l'utilisateur change avec succès pour B, PUIS le zombie se termine. La probabilité est faible (nécessite que l'agent prenne plus de temps que le timeout + la lecture de réconciliation + un changement réussi ultérieur), mais elle n'est pas nulle. Documentons-le ici plutôt que d'affirmer que la réconciliation élimine totalement la race condition du timeout.

### 2.1 Contrat du demux (deux points d'insertion)

Le demux possède **deux points d'insertion** car A1 et A2 utilisent des transports différents (v7) :

- **A1 — `BridgeClient.extNotification()` (`bridgeClient.ts:491`) :** la notification `current_model_update` → `model_switched`.
- **A2 — `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`) :** le `sessionUpdate` `current_mode_update` → `approval_mode_changed`. Aujourd'hui, cette méthode publie chaque notification textuellement sous la forme `{ type: 'session_update', data: params }` ; le demux est ajouté ici.

Les règles ci-dessous s'appliquent quel que soit le point d'insertion où le sous-type arrive :

- **Table de promotion :** `current_model_update → model_switched` ; `current_mode_update → approval_mode_changed` (limité à la session ; différé à l'étape 3, voir §7).
- **Mapping du payload (les deux sous-types doivent être spécifiés, sinon la validation du SDK les rejette) :**
  - `current_model_update → model_switched` : mapper `currentModelId → data.modelId` et remonter l'enveloppe/`params.sessionId` dans `data.sessionId`. Le validateur du SDK exige un `data.modelId` non vide (`events.ts:1910`) ; une promotion textuelle (qui conserve `currentModelId`) échouerait à la validation et serait silencieusement rejetée — **A1 non fonctionnel**. La promotion est donc un mapping de champs, et non un simple renommage.
  - `current_mode_update → approval_mode_changed` : construire le payload complet `{ sessionId, previous, next, persisted: false, scope: 'session' }`. `next` = le `currentModeId` de la notification ; **`previous` est extrait du cache d'état du bridge** `entry.currentApprovalMode` (la valeur avant ce changement — §2.3), ainsi l'agent n'envoie **pas** `previousModeId` (ACP `CurrentModeUpdate` n'a pas ce champ de toute façon). Un changement en session n'est jamais persisté au niveau du workspace, d'où `persisted:false`, `scope:'session'`. `scope` est **additif** sur `DaemonApprovalModeChangedData` et orthogonal à `persisted` : `scope` indique quel bus (cette session vs les sessions pairs) l'événement cible ; `persisted` indique s'il a également écrit les paramètres du workspace. Le chemin HTTP `persist:true` propre au bridge émet le miroir `scope:'workspace', persisted:true` (`bridge.ts:3007`).
- **Suppression pendant le roundtrip (par type de changement, pas par session) :** promouvoir un `current_model_update` uniquement lorsqu'aucun roundtrip de **modèle** piloté par le bridge n'est en cours pour cette session ; promouvoir un `current_mode_update` uniquement lorsqu'aucun roundtrip de **mode d'approbation** piloté par le bridge n'est en cours. Un roundtrip de modèle NE DOIT PAS supprimer un `current_mode_update` en session (et vice-versa) — une suppression croisée supprimerait silencieusement le changement de l'autre axe.
- **Déduplication au mieux (modèle) :** le demux rejette un `current_model_update` dont le `currentModelId` est déjà égal à `entry.currentModelId` (§2.3) — une opération nulle redondante. Il n'essaie **pas** de distinguer par la valeur entre obsolète et récent (impossible par la seule valeur) ; le filet de sécurité faisant autorité pour la race condition de timeout/concurrente est la réconciliation du §2.2 (§2 point 4).
- **Rejet si supprimé (troisième règle) :** lorsqu'un sous-type _promouvable_ N'EST PAS promu (supprimé ou obsolète), **le rejeter entièrement** — ne **pas** revenir à la publication du `session_update` générique. Le bridge publie déjà l'événement nommé faisant autorité ; émettre également le wrapper générique créerait un double signal. (La dérive résiduelle concurrente en session est gérée par la réconciliation du §2.2.)
- **Suppression du wrapper générique :** un sous-type promu publie uniquement l'événement nommé — **sauf pendant la fenêtre de transition à double émission (ci-dessous)**.
- **Transition à double émission (synchronisation avec le compagnon IDE, voir §6) :** parce que le daemon et le compagnon IDE VS Code sont livrés sur des canaux différents et ne peuvent pas basculer de manière atomique, la PREMIÈRE version de la promotion de `current_mode_update` publie **à la fois** le `approval_mode_changed` promu ET le `session_update{sessionUpdate:'current_mode_update'}` générique hérité pour un cycle de version. Le `case 'current_mode_update'` existant du compagnon IDE continue de fonctionner ; une fois que son gestionnaire `approval_mode_changed` est livré, la version suivante supprime la double émission. `current_model_update` est tout nouveau (pas de consommateur hérité), il est donc promu directement sans double émission. **La suppression est imposée, pas laissée à la mémoire :** un commentaire `TODO(dual-emit-removal)` sur le site de publication à double émission référence cette section, et l'étape 3 du §7 contient un ticket de suivi avec une version cible — ainsi, le wrapper générique redondant ne peut pas devenir silencieusement permanent (et aucun nouveau consommateur ne doit s'appuyer dessus).
- **Observabilité (requise, non optionnelle) :** émettre un log structuré à chaque décision du demux — `[demux] session=<id> type=<sub> action=promoted|dropped|suppressed|generic reason=<why>`. `BridgeClient.sessionUpdate()` n'a aucun log aujourd'hui ; le cas `dropped` en particulier doit être visible afin que l'astreinte puisse distinguer "l'agent n'a pas émis" / "le demux a rejeté" / "SSE perdue".
- **Sous-types inconnus :** inchangé (`session_update` générique).

### 2.2 Réconciliation post-roundtrip (dérive concurrente en session)

Supprimer + rejeter suppose que le roundtrip du bridge et l'agent décrivent le **même** changement. Cela échoue lors d'un changement concurrent en session, car `/model` en session appelle `Session.setModel` **directement et n'entre PAS dans `modelChangeQueue`** :

1. Le bridge `setSessionModel(A)` démarre → la fenêtre de suppression s'ouvre.
2. L'utilisateur tape `/model B` dans le terminal → `Session.setModel(B)` (contourne la file d'attente) → l'agent émet `current_model_update(B)`.
3. Le demux **rejette** B (fenêtre de suppression ouverte).
4. Le bridge publie le `model_switched(A)` faisant autorité ; **le bus affiche A, la session exécute B — rien ne réconcilie.**

**Contrat (v9/v10/v11 — lecture faisant autorité, protégée par génération, non récursive) :** la réconciliation se déclenche lorsqu'un roundtrip de modèle du bridge se termine — sur les chemins de succès **et** d'échec (un `.finally` sur le roundtrip, car le cas de timeout/échec est exactement celui où le bus est le plus susceptible d'avoir divergé). Il lit le **vrai** modèle actuel de l'agent via `getSessionContextStatus` (`bridge.ts:2784`, `extMethod` asynchrone) et, s'il diverge du modèle actuel du bus (`entry.currentModelId` — sur le chemin d'échec, il s'agit de la valeur **pré-roundtrip**, car `model_switch_failed` ne met pas à jour le cache), émet un `model_switched` correctif via `publishModelSwitched`. **Pourquoi pas le cache du §2.3 _comme vérité_ :** le cache n'est mis à jour qu'aux sites de publication, il ne peut donc pas observer un changement concurrent en session que le demux a **rejeté** — le lire conclurait à tort à "pas de divergence". L'agent est la seule source de vérité. La lecture est asynchrone mais s'exécute **post-règlement, en dehors du demux**, la contrainte de bloc synchrone du §5 ne s'applique donc pas. (À plus long terme : router le `/model` en session via `modelChangeQueue` — §10 Q3 — pour rendre cette race condition impossible à la source.) La même réconciliation s'applique à A2 une fois que `approvalModeQueue` existe.

**Invariant de lecture fraîche (v11/v12) :** la lecture `getSessionContextStatus` utilisée par la réconciliation DOIT retourner une valeur fraîche à un instant T provenant du processus agent — elle DOIT contourner tout cache de réponse, toute déduplication de requête ou tout regroupement en cours. Sans cela, une réponse en cache qui se trouve correspondre à `entry.currentModelId` produit un faux "convergé" (divergence réelle manquée — l'agent a peut-être évolué), et une réponse en cache qui diverge de `entry.currentModelId` produit un faux "correctif" qui définit le bus à une valeur obsolète au lieu du vrai modèle actuel de l'agent. En pratique : `extMethod` est un nouvel appel JSON-RPC `requestSessionStatus` à chaque invocation — aucun cache au niveau du middleware ou du transport n'existe aujourd'hui. L'invariant est contractuel : toute future couche de cache DOIT exempter les lectures de réconciliation.

**Garde de génération (v10 — ferme le TOCTOU de la fenêtre de lecture) :** entre le règlement et le retour de la lecture asynchrone, un `/model C` concurrent en session peut promouvoir `model_switched(C)` ; la lecture en cours (émise avant C) retourne la valeur pré-C et la réconciliation écraserait C. Correction : une `modelPublishGeneration` par session est incrémentée à **chaque** publication de `model_switched` (bridge / promotion demux / correctif de réconciliation) — exclusivement via le helper `publishModelSwitched` (v11). La réconciliation capture la génération **avant** la lecture et **ignore le correctif si elle a avancé** pendant la lecture — une publication faisant autorité plus récente est déjà arrivée, le bus est donc à jour.

**Helper `publishModelSwitched` (v11/v12 — mécanisme de renforcement) :** une fonction unique `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })` qui atomiquement (en un tour synchrone) : (1) définit `entry.currentModelId = modelId`, (2) incrémente `entry.modelPublishGeneration`, (3) publie `model_switched` sur le bus (avec `originatorClientId` si fourni). **Tous** les sites de publication de `model_switched` — succès du roundtrip du bridge, `applyModelServiceId`, promotion du demux, correctif de réconciliation — DOIVENT passer par ce helper. Le roundtrip du bridge et `applyModelServiceId` passent le `originatorClientId` résolu ; la promotion du demux et le correctif de réconciliation n'en passent aucun (aucun client unique n'a piloté le changement). L'appel direct à `events.publish({type:'model_switched', ...})` est interdit en dehors du helper. Cela rend impossible l'oubli d'une incrémentation de génération ou la suppression silencieuse de l'attribution client, et un invariant de test peut affirmer : après n'importe quel chemin de code qui produit un `model_switched`, la génération a avancé d'exactement 1.

**Règle de non-récursion (v11/v12 — appliquée structurellement) :** le correctif de réconciliation appelle `publishModelSwitched` (une publication de bus locale) et ne programme **PAS** de réconciliation ultérieure. Si un implémenteur factorise `publishModelSwitched` via un wrapper qui attache également une réconciliation `.finally`, le résultat est une boucle corrective infinie (réconcilier → lire → publier → réconcilier → …). Chaque correctif incrémente la génération, mais chaque nouvelle réconciliation lit l'agent et peut trouver une divergence (le correctif met à jour le _bus_, pas l'_agent_). **Garde structurelle (v12) :** un drapeau `reconciliationInFlight: boolean` par session est mis à `true` avant la lecture asynchrone et effacé après (dans `.finally`). Le `.finally` de règlement du roundtrip vérifie ce drapeau avant de programmer la réconciliation ; si `true`, il logue `[reconcile] session=<id> action=skipped-reentrant` et retourne. Cela rend la non-récursion invariante sous le refactoring — elle ne peut pas être contournée par une réorganisation du graphe d'appels. Le helper `publishModelSwitched` lui-même n'a pas d'effets de bord au-delà des points (1)–(3).

**Erreur de lecture : tentatives limitées, puis surface.** Un échec transitoire de `getSessionContextStatus` ne doit pas laisser le bus définitivement divergent avec seulement une ligne de log. Réessayer 1 à 2 fois avec un court backoff ; si tout échoue, émettre un événement de bus `reconciliation_failed` et loguer `action=read-error`.

- **Payload (v13) :** `reconciliation_failed { sessionId: string, error: string, retryCount: number, trigger: 'roundtrip-settled' | 'failed' }`. L'`error` distingue "le processus agent a crashé" de "timeout JSON-RPC" pour l'UX du consommateur et les diagnostics d'astreinte.
- **Contrat consommateur :** consultatif — les clients PEUVENT afficher un avertissement transitoire et PEUVENT déclencher leur propre pull `getSessionContextStatus` pour s'auto-réparer. Pas de gestionnaire obligatoire ; en l'absence de consommateurs, l'état du bus reste tel que publié en dernier (obsolète mais non terminal).
- **Log par tentative :** chaque tentative de réessai émet sa propre ligne de log : `[reconcile] session=<id> attempt=<n>/<max> error=<msg>`, afin que l'astreinte puisse distinguer un échec transitoire d'un échec soutenu sans avoir besoin de l'événement agrégé final.
**Ordonnancement des événements consommateurs sur le chemin d'échec (v12).** Sur le chemin d'échec (timeout/erreur), les consommateurs peuvent observer `model_switch_failed` suivi (après réconciliation asynchrone) de `model_switched(A)` pour le modèle même qui a "échoué" — cela se produit lorsque l'agent a effectivement appliqué le modèle malgré le timeout du bridge. C'est le comportement correct : la correction de réconciliation fait autorité. Les consommateurs DOIVENT traiter `model_switched` comme toujours faisant autorité, indépendamment des événements d'échec précédents (ignorez les toasts d'erreur pour le modèle ayant échoué). La §8 inclut un test validant cet ordonnancement complet des événements visibles par le consommateur.

**Observabilité :** `[reconcile] session=<id> trigger=roundtrip-settled|failed baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=corrected|converged|skipped-newer-gen|skipped-reentrant|read-error`.

### 2.3 Cache d'état du bridge (source synchrone du modèle/mode/commandes "actuel")

La vérification d'obsolescence (stale check) (§2 point 4), la réconciliation §2.2, et le snapshot A5 (§5) ont tous besoin du modèle / mode d'approbation / commandes **actuel** de la session. Le bridge n'avait pas d'accesseur synchrone — seulement `getSessionContextStatus` (`bridge.ts:2784` → `requestSessionStatus`, un aller-retour `extMethod` asynchrone), et un `await` à cet endroit rouvre exactement la fenêtre TOCTOU que ces mécanismes ferment. Donc :

- Ajouter à `SessionEntry` : `currentModelId?: string`, `currentApprovalMode?: ApprovalMode`, `availableCommands?: AvailableCommand[]`.
- **Mise à jour synchrone à chaque site de publication**, dans le même tour synchrone que la publication (pas de `await` entre la lecture de l'ancienne valeur et l'écriture de la nouvelle) : toutes les publications `model_switched` passent par le helper §2.2 `publishModelSwitched` (qui met à jour de manière atomique `entry.currentModelId` + incrémente `entry.modelPublishGeneration` + publie sur le bus) ; `approval_mode_changed` (`:2979` / `:3007`) met à jour `entry.currentApprovalMode` ; `availableCommands` est mis à jour dans `BridgeClient.sessionUpdate()` lorsqu'il reçoit un `available_commands_update` sessionUpdate générique — le handler définit `entry.availableCommands = payload.commands` de manière synchrone **avant** la publication de transfert générique. Le helper garantit qu'aucun site de publication ne peut manquer une mise à jour du cache ou de la génération.
- **Spécificités de `availableCommands` (v13) :** le type est `AvailableCommand[]` (correspondant à `status.ts`). Contrairement au modèle/mode, ce champ n'a **aucun événement de bus promu nommé** et **aucune réconciliation** — c'est un cache passif, mis à jour par le chemin `session_update` générique. Si l'implémenteur manque le hook, le snapshot A5 sert des commandes obsolètes/non définies sans filet de sécurité. Le chemin de déclenchement est explicitement `BridgeClient.sessionUpdate()` → vérifie `params.type === 'available_commands_update'` → met à jour le cache → transfère en tant que `session_update` générique.
- **Initialisation (Seed)** à partir de la réponse ACP `createSession` / `loadSession` lorsque l'entrée est créée (modèle/mode initial), avant que tout changement ne se produise.
- **Consommateurs (lectures de champs synchrones) :**
  - **Snapshot A5 (§5) :** lit les trois champs dans un seul bloc synchrone — l'objectif principal du cache.
  - **Déduplication demux au mieux (Best-effort) (§2.1) :** ignore un `current_model_update` dont le `currentModelId` est déjà égal à `entry.currentModelId`.
  - **Dérivation de `previous` (A1/A2) :** le demux remplit `approval_mode_changed.previous` à partir de `entry.currentApprovalMode` _capturé avant_ l'application de la nouvelle valeur — ainsi **l'agent n'envoie jamais `previousModeId` / `previousModelId`** (ce qui contourne l'absence de champ `previousModeId` dans le schéma ACP `CurrentModeUpdate`).
- **PAS un consommateur : réconciliation §2.2.** La réconciliation a besoin du modèle _réel_ de l'agent, ce que le cache ne peut pas fournir (il ne voit jamais les notifications supprimées/suppressées) ; la réconciliation utilise à la place la lecture faisant autorité de `getSessionContextStatus` (§2.2, v9). Le cache ne reflète que ce qui a été _publié_.

Cela fait du cache une source synchrone de premier plan pour le snapshot + la déduplication + `previous`, sans empiéter sur le chemin de vérité de la réconciliation.

### Miroir d'espace de travail (décision explicite)

`Session.setModel` a par défaut `persistDefault:true` (`Session.ts:1610`) et écrit `model.name` via `getPersistScopeForModelSelection(this.settings)` (`Session.ts:1611`) — **portée workspace pour un workspace de confiance possédant `modelProviders`, sinon portée user**. Dans les deux cas, **la phase 1 de A1 ne fait qu'une diffusion à l'échelle de la session** ; justification : les sessions pairs récupèrent la valeur par défaut persistée lors du prochain spawn, et il n'y a pas de filtrage inter-sessions pertinent pour la sécurité comme pour le mode d'approbation. Un miroir d'espace de travail pour les modèles persistés est un suivi différé explicite (§10), et non omis silencieusement.

### Risque

Double diffusion (atténué par §1.1 + les trois règles de §2.1) ; perte d'événements d'échec (exception du point 3). Tests dans §8.

---

## 3. A2 — Changement de mode d'approbation en session (asymétrique ; bloqué sur #4510)

### Problème

1. **Changement silencieux en session.** `Session.setMode` (`Session.ts:1561`) → `config.setApprovalMode()` (`:1573`), aucune notification.
2. **HTTP contourne `Session.setMode`.** `setSessionApprovalMode` pilote l'extMethod `qwen/control/session/approval_mode` (`acpAgent.ts:2200`) → `config.setApprovalMode()` directement (`acpAgent.ts:2228`). L'émission en session seule ne couvre pas HTTP, et HTTP n'émet aucune notification d'agent.
3. **Payload + persistance.** `approval_mode_changed` a besoin de `{previous,next,persisted}` (`bridge.ts:2979` à l'échelle de la session, `:3007` à l'échelle du workspace). `current_mode_update` ne transporte que `currentModeId` ; l'agent n'a pas de concept de `persist`.
4. **Pas encore de primitive de sérialisation.** `approvalModeQueue` **n'existe pas** dans la base de code aujourd'hui ; le chemin HTTP du mode d'approbation (`bridge.ts:2893-3020`) exécute l'extMethod + la publication en ligne sans file d'attente par session (contrairement à `modelChangeQueue` du chemin du modèle). La fenêtre de suppression/race est donc illimitée jusqu'à ce que #4510 l'intègre.

### Design proposé

**À l'échelle de la session — émissions en session ; le bridge reste le seul émetteur pour HTTP :**

1. Émettre `current_mode_update` depuis `Session.setMode` (couvre ACP `setSessionMode`, `acpAgent.ts:922`, et `/approval-mode` en session).
2. Le chemin HTTP de l'extMethod conserve la publication `approval_mode_changed` à l'échelle de la session du **bridge** (`bridge.ts:2979`) et n'émet **aucune** notification d'agent (il contourne `Session.setMode`) — le bridge est le seul émetteur ; rien à supprimer.
3. **`previous` provient du cache d'état du bridge — l'agent n'envoie PAS `previousModeId`.** Le normaliseur SDK `normalizeApprovalModeChanged` (`normalizer.ts:754`) exige `previous`, donc le `approval_mode_changed` promu doit le transporter. Mais `CurrentModeUpdate` de l'ACP n'a que `currentModeId` (pas de champ `previousModeId` — la même contrainte d'union externe que la v7 a rencontrée pour A1 ; on ne peut pas ajouter de champ requis au type spécifié). Résolution : le **demux remplit `previous` à partir de `entry.currentApprovalMode`** (la valeur en cache avant ce changement, §2.3), et met à jour le cache vers `currentModeId` dans le même tour synchrone. Le `current_mode_update` de l'agent conserve la forme ACP non modifiée (`{currentModeId}`), et le bridge produit toujours un `{previous,next}` complet — pas de suppression SDK, pas de changement de schéma ACP.
4. **Généralisation du helper (modèle de migration spécifié) :** `sendCurrentModeUpdateNotification` (`Session.ts:1625`) dérive aujourd'hui `newModeId` d'un `ToolConfirmationOutcome` (seulement `auto-edit`/`default`/current). Généralisez-le pour accepter un `currentModeId` explicite afin que `Session.setMode` puisse émettre pour n'importe quel `ApprovalMode` (`plan`/`yolo`/`auto`/…). Les deux appelants existants de confirmation d'outil (`Session.ts:2160`, `:2168`) conservent leur point d'entrée `ToolConfirmationOutcome` (qui pré-calcule `currentModeId` puis délègue) — PAS de suppression du jour au lendemain (flag-day) ; la dépréciation est suivie séparément. Aucun appelant n'a besoin de calculer `previous` (le bridge le dérive, point 3).

**À l'échelle du workspace (persist) reste uniquement au niveau du bridge :**

5. La diffusion persist + workspace (`bridge.ts:3007`) reste une publication au niveau du bridge conditionnée par le flag `persist` du bridge ; `persisted:true` n'apparaît que sur l'événement workspace. Ajoutez un discriminateur `scope: 'session' | 'workspace'`.

### Prérequis strict (bloque A2)

A2 est **bloqué en attendant que la PR #4510 intègre `approvalModeQueue`** (ou un tracker équivalent par session pour les allers-retours du mode d'approbation). Sans cela, la fenêtre de suppression/coordination est illimitée. Concrètement (la divergence que cela évite) : le bridge démarre `setSessionApprovalMode('default')` ; pendant ce temps, `/approval-mode yolo` en session se déclenche ; si la promotion est supprimée pendant toute la fenêtre illimitée, la notification `yolo` est abandonnée et ne se redéclenche jamais → le bus affiche `default` alors que le mode réel est `yolo` (pertinent pour la sécurité). La fenêtre bornée de `approvalModeQueue` est la mesure d'atténuation.

### Cas limite de double émission

`/approval-mode` pendant une boîte de dialogue de confirmation d'outil ouverte peut déclencher deux `current_mode_update` en quelques ms (le `setMode` de l'utilisateur + le handler `ProceedAlways` de l'outil). Acceptable (converge) ; possibilité d'ignorer l'émission lorsque le mode résultant est égal à l'actuel. Documenté, non bloquant.

### Risque / compat

Additif sur le wire (réutilisation de `current_mode_update` + `previousModeId` + `scope`) mais **pas** additif au niveau du SDK pour le type promu (voir §6). Strictement bloqué sur #4510.

---

## 4. A4 — Sémantique originator/voter de `permission_resolved`

### Problème

`permission_request.originatorClientId` = originator du prompt. `permission_resolved.originatorClientId` = voter — l'émission à `permissionMediator.ts:1125` estampille `originatorClientId` à partir de `resolverClientId` dans le spread à `permissionMediator.ts:1135-1137` (le clientId de confiance du voter, compatibilité O8 pré-F3). Les consommateurs doivent traiter `permission_resolved` comme un cas particulier.

### Design proposé (additif sur le wire et le SDK)

- **Wire :** émettre `voterClientId` aux côtés de `originatorClientId` (même valeur). Les deux sont **optionnels** — les résolutions sans voter (expiration du timer, session fermée, voter en boucle locale sans `X-Qwen-Client-Id`) n'en portent aucun, comme aujourd'hui.
- **Événement typé SDK :** exposer **à la fois** `originatorClientId` (inchangé — pas de renommage, pas de cassure) **et** un nouveau `voterClientId` optionnel ; l'ancien champ est documenté comme un alias déprécié pour une future version majeure.
- L'originator du prompt reste disponible en le corrélant avec le `permission_request` correspondant.

### Wire / compat

Additif sur les deux couches — aucune cassure pour les consommateurs. Reflète l'aliasing D4 (PR #4510).

---

## 5. A5 — Snapshot side-channel à l'attachement

### Problème

Un attachement avec `Last-Event-ID` obtient un replay + un live tail, mais pas de snapshot side-channel actuel. Aujourd'hui, il récupère `qwen/status/session/context` (`packages/acp-bridge/src/status.ts:96`), les commandes supportées, et `POST /load`.

### Design proposé

Opt-in via `?snapshot=1` ; émettre une trame **`session_snapshot`** synthétique après le replay :

```
session_snapshot { approvalMode, model, availableCommands? }
```

- **`replay_complete` existe déjà** (`eventBus.ts:444`, livré par la #4484 mergée) — la phase 2 de A5 introduit uniquement la nouvelle trame `session_snapshot`, pas `replay_complete`.
- **Ordre de reprise : replay → `replay_complete` → `session_snapshot`.** Le snapshot est le mot de la fin faisant autorité.
- **Capture au moment de l'émission depuis le cache d'état du bridge §2.3, dans un seul bloc synchrone.** Cela est faisable précisément parce que §2.3 ajoute `entry.currentModelId` / `currentApprovalMode` / `availableCommands` en tant que champs synchrones (maintenus à jour à chaque publication + initialisés à la création de la session). Le snapshot lit ces trois champs et publie en un seul tour synchrone — pas de `await` entre les deux, pas d'aller-retour de statut `extMethod` asynchrone — de sorte qu'une mutation simultanée ne peut pas s'intercaler. (La "capture à l'abonnement (T0), émission après replay" de la v3 avait un bug d'écrasement obsolète : un `model_switched` en direct livré pendant le replay serait écrasé par le snapshot T0 appliqué en dernier ; la capture à l'émission depuis le cache en direct corrige cela.) Sans §2.3, il n'y a pas de source synchrone pour l'état "actuel" et ce contrat serait impossible à implémenter — ce qui était le point Critique de la v8.
- **Ordre au premier attachement** (pas de `Last-Event-ID`) : `replay_complete` n'est PAS poussé de force (aucun replay n'a eu lieu), et le design ne synthétise **pas** de `replay_complete{replayedCount:0}` — faire cela élargirait le contrat "replaying→live" de cet événement pour les consommateurs existants. À la place, `session_snapshot` est **auto-délimité au premier attachement** : il est émis comme première trame, avant le live tail ; les consommateurs traitent un `session_snapshot` comme "baseline établie". (La reprise conserve l'ordre replay → `replay_complete` → snapshot ci-dessus.)
- **`pendingPermissionIds` exclu** (Sécurité, ci-dessous).
- SDK : l'événement typé `session.snapshot` initialise les champs side-channel du reducer d'état de vue, appliqués en dernier (lors de la reprise) / en premier (lors du premier attachement).
### Sous-contrat `?snapshot=1`

Première connexion : désactivé sauf si `?snapshot=1`. Reconnexion : opt-in (le plus utile). Basculement entre les reconnexions : légal + idempotent (chaque abonnement est indépendant). Atomicité : au mieux (best-effort) — capture à l'émission + réconciliation des deltas live ultérieurs ; le test du reducer couvre une mutation en course.

### Sécurité : pourquoi pas de `pendingPermissionIds`

Inclure les IDs en attente permettrait à un client de voter sur une requête dont il n'a jamais reçu le contexte. `respondToSessionPermission` valide l'existence de la session, l'état `requestId`/`pending`, l'enregistrement du `clientId` (`resolveTrustedClientId` par rapport à `entry.clientIds`, `bridge.ts:2271`), et la légalité de l'option — mais pas si l'électeur a observé le `permission_request` original. L'attaquant est donc un collaborateur de session enregistré (déjà authentifié par bearer + `clientId` enregistré), et non un client anonyme — ce qui est plus restreint que "n'importe quel nouveau client", mais la faille est réelle : il pourrait approuver une opération destructrice sans en avoir le contexte. Les clients qui ont légitimement besoin des permissions en attente les découvrent via le replay (le contexte complet est transmis). Supprimer ce champ rend également caduque la course snapshot/résolution.

### Wire / compat

Additif, opt-in. Un ancien SDK expose la frame inconnue sous forme d'événement UI `debug` (bruyant, mais non cassé) — une raison de plus de le garder en opt-in.

### Alternatives

Phase 1 : documenter uniquement le contrat de pull (pull après `replay_complete`) ; différer la frame.

---

## 6. Aspects transverses

- **Modèle à autorité du bridge (§1.1)** : le bridge possède les événements pour les changements qu'il pilote ; les changements en session ajoutent une notification que le bridge démuxe — A1 via `extNotification()` (`bridgeClient.ts:491`), A2 via `sessionUpdate()` (`bridgeClient.ts:397`) ; la suppression + l'abandon en cas de suppression empêchent le double signal. La suppression n'a de sens que pour le chemin du modèle ; le mode d'approbation HTTP n'a pas de notification d'agent.
- **Le demux (§2.1) est un prérequis strict** ; A2 est de plus **bloqué par #4510** (`approvalModeQueue`).
- **NON additif partout ; géré par une transition à double émission.** Promouvoir `current_mode_update` → `approval_mode_changed` change le type d'événement observé. Le daemon et le compagnon IDE VS Code sont livrés sur des canaux différents (mise à jour automatique CLI vs Marketplace), donc le basculement ne peut pas être atomique. **Chaîne de consommateurs affectée (tous doivent gagner un chemin `approval_mode_changed`) :**
  - `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts:177` (`case 'current_mode_update'`) — le gestionnaire final ;
  - le dispatch en amont qui lui route les événements du daemon — `daemonIdeConnection.ts` et `DaemonChannelBridge.ts` switchent sur `event.type` et abandonnent les types non reconnus via `default`, donc même un gestionnaire final mis à jour ne reçoit jamais un `approval_mode_changed` brut tant que ceux-ci ne sont pas étendus.
  - **Atténuation (§2.1 double émission) :** la première version émet À LA FOIS l'ancien `session_update{current_mode_update}` générique ET le `approval_mode_changed` promu ; le compagnon IDE continue de fonctionner sur l'ancienne frame ; une fois que son chemin `approval_mode_changed` est livré, la version suivante supprime la double émission. A4 (`voterClientId`) et A5 (frame opt-in) SONT additifs (pas de transition nécessaire).
- **Les événements d'échec restent propres au bridge** (`model_switch_failed`).
- **La dérive concurrente en session** est bornée par la réconciliation post-roundtrip §2.2.
- **Mises à jour du reducer SDK** (nommage, pour éviter la confusion A1/A2) : A1 introduit `current_model_update` → `model.changed` ; A2 promeut `current_mode_update` → `approval_mode_changed` ; A4 ajoute `voterClientId` optionnel ; A5 initialise l'état du canal secondaire depuis `session.snapshot`.

---

## 7. Ordonnancement

1. **A4** — wire additif + alias SDK. Le plus petit, non bloqué.
2. **A1 — `current_model_update` via `extNotification`** (livré dans le core #4546) — `Session.setModel` émet l'`extNotification` ; le demux dans `BridgeClient.extNotification()` (`bridgeClient.ts:491`) la promeut en `model_switched`. Chemin core + suppression par type + observabilité faits dans #4546 ; **le cache d'état §2.3 + la vérification d'obsolescence + la réconciliation §2.2 sont le suivi de A1** (ils ont besoin des champs du cache).
   - **2b. Cache d'état du bridge §2.3** — ajouter `currentModelId`/`currentApprovalMode`/`availableCommands` à `SessionEntry`, mis à jour à chaque publication + initialisé à la création. Prérequis pour le suivi obsolescence/réconciliation de A1 ET pour A5.
   - **2c. Couplage atomique :** la réconciliation et la garde `modelPublishGeneration` forment une seule livraison atomique ; livrer la réconciliation sans la garde crée une régression d'écrasement (une promotion concurrente pendant la lecture asynchrone de `getSessionContextStatus` écrirait une valeur obsolète en retour). Les deux doivent arriver dans la même PR.
3. **A2 — BLOQUÉ sur la PR #4510** (`approvalModeQueue`). Ajoute la promotion de `current_mode_update` (`previous` dérivé du cache §2.3 — pas de `previousModeId` sur le wire), l'émission de `Session.setMode`, la généralisation des helpers, le `scope`, la conservation de la publication workspace du bridge, la transition à double émission + les mises à jour du compagnon IDE + du dispatch en amont.
   - **3b. Suppression de la double émission** — suivie par une issue GitHub avec une version cible ; le site de publication à double émission porte un `TODO(dual-emit-removal)` référençant §2.1. Fermer l'issue quand la prochaine version supprime la double émission.
   - **3c. Réconciliation post-roundtrip A2** — même contrat §2.2, lecture du vrai mode d'approbation de l'agent ; ajoute `approvalModePublishGeneration` et le helper `publishApprovalModeChanged`. Doit arriver en même temps que la promotion A2 (même justification que 2c — une réconciliation sans la garde de génération est pire que pas de réconciliation).
4. **A5** — docs du contrat de pull phase 1 ; phase 2 `session_snapshot` opt-in (capture à l'émission dans un bloc synchrone ; après `replay_complete` à la reprise, première frame auto-délimitée à la première connexion). `replay_complete` existe déjà (#4484) ; seul `session_snapshot` est nouveau.

Chacun arrive dans sa propre PR d'implémentation après l'approbation de cette conception.

---

## 8. Plan de test

- **Demux/§1.1 :** `current_model_update` promu publie `model_switched` et supprime le wrapper générique ; une notification pendant un roundtrip de modèle bridge en cours est **abandonnée** (non publiée en générique, non promue) ; une notification en session EST promue ; un sous-type inconnu reste générique.
- **A1 :** `/model` en session ET le mode plan publient chacun exactement un `model_switched` ; `POST /model` HTTP et `applyModelServiceId` à la connexion publient chacun exactement un (pas de double) ; un `setModel` en échec (en session + HTTP) n'émet pas de `model_switched`, HTTP émet toujours `model_switch_failed` ; un `model_switched` après un `model_switch_failed` pour timeout est livré (autorité du plus récent).
- **A2 :** `setMode` en session publie un `approval_mode_changed` scopé à la session `{scope:'session',persisted:false}` ; `POST /approval-mode` HTTP en publie un (bridge, seul émetteur, pas de double) ; le non-persisté ne broadcast PAS au workspace ; le persisté ajoute un événement `scope:'workspace',persisted:true` ; un `setMode` en échec n'émet rien ; la divergence à fenêtre non bornée est empêchée une fois que `approvalModeQueue` est livré.
- **A4 :** cas distinctif — le client A soumet le prompt (donc `permission_request.originatorClientId === A`), un client B DIFFÉRENT émet le vote de résolution (donc `permission_resolved.voterClientId === B`), affirmer que les deux diffèrent (c'est pour cette désambiguïsation que A4 existe, pas juste pour la valeur même client) ; la résolution par timer/sans-clientId ne porte aucun des deux champs ; le SDK expose les deux ; le fallback ancien-daemon expose l'électeur via `originatorClientId`. (Fait dans la PR #4539.)
- **A5 :** la reprise avec `?snapshot=1` produit un `session_snapshot` (mode/modèle/commandes, pas de `pendingPermissionIds`) après `replay_complete` ; la première connexion produit un `session_snapshot` comme première frame sans `replay_complete` synthétique ; une connexion SANS le flag ne produit AUCUN snapshot ; la bascule du flag entre les reconnexions est idempotente ; un `model_switched` livré pendant le replay n'est PAS écrasé par le snapshot (capture synchrone à l'émission).
- **Déduplication au mieux (§2.1) :** un `current_model_update(A)` arrivant quand `entry.currentModelId` est **déjà A** est **abandonné** (no-op redondant). Un `current_model_update(A)` quand le cache est B (A≠B), sans roundtrip en cours, **est promu** (le demux ne distingue PAS par valeur obsolète vs récent — c'est le travail de la réconciliation). _(Corrigé depuis un scénario v8 qui attendait à tort un abandon basé sur la valeur.)_
- **Réconciliation (§2.2, autoritaire + gardée par génération) :**
  - _correctif :_ `setSessionModel(A)` du bridge en cours → `/model B` concurrent en session abandonné (suppression) → le bridge publie `model_switched(A)` → `getSessionContextStatus` post-stabilisation (mocké → B) → `model_switched(B)` correctif ; le bus converge vers B (et le correctif met à jour le cache + la génération).
  - _convergé :_ la lecture du statut est égale à `entry.currentModelId` (le modèle actuel du bus) → pas de correctif (`action=converged`).
  - _generation-skip (TOCTOU) :_ une promotion arrive pendant la lecture asynchrone (la génération avance) → la réconciliation **saute** le correctif même si sa lecture est obsolète (`action=skipped-newer-gen`).
  - _déclencheur de chemin d'échec :_ un roundtrip avec timeout (`model_switch_failed`) déclenche toujours la réconciliation ; la base de comparaison est `entry.currentModelId` (la valeur pré-roundtrip, car `model_switch_failed` ne met PAS à jour le cache) ; si l'agent a effectivement appliqué le modèle A en timeout (la lecture retourne A) et que `entry.currentModelId` est toujours l'ancienne valeur B, la réconciliation émet un `model_switched(A)` correctif via `publishModelSwitched` → le bus converge vers A.
  - _erreur de lecture :_ la lecture du statut échoue à toutes les tentatives → émet `reconciliation_failed { sessionId, error, retryCount, trigger }` avec la payload correcte ; logs par tentative émis (`attempt=1/<max>`, `attempt=2/<max>`) ; pas de correctif.
- **Non-suppression inter-axes (§2.1) :** un roundtrip de modèle bridge en cours ne supprime PAS un `current_mode_update` en session (il EST promu), et vice-versa.
- **Cache d'état du bridge (§2.3) :** chaque site de publication de `model_switched` passe par `publishModelSwitched` qui met à jour `entry.currentModelId` ET incrémente `entry.modelPublishGeneration` ; affirmer que la génération avance d'exactement 1 après chacun (y compris le correctif de réconciliation). Les lectures snapshot/dédup/garde de génération voient la dernière valeur de manière synchrone ; cache initialisé à la création de la session.
- **Transition à double émission (§2.1/§6) :** pendant la fenêtre, à la fois `approval_mode_changed` ET `session_update{current_mode_update}` sont émis ; après suppression, seulement `approval_mode_changed`.
- **Transport `extNotification` (v7) :** `current_model_update` arrive via `extNotification()` (pas `sessionUpdate()`) et est promu en `model_switched`.
- **Migration de compat (§2.1) :** un reducer SDK qui recevait auparavant `current_mode_update` en tant que `session_update` générique atteint un état identique une fois qu'il est promu en `approval_mode_changed`.
- **Régression de helper (§3 point 4) :** les appelants de `exit_plan_mode` et `ProceedAlways` produisent toujours des payloads `current_mode_update` correctes après la généralisation du helper.
- **Cas limite de double émission (§3) :** `/approval-mode` et `ProceedAlways` concurrents émettent tous les deux ; le reducer converge.
- **Garde structurelle de non-récursion (§2.2) :** pendant que la réconciliation est en cours (`reconciliationInFlight === true`), une promotion concurrente qui déclencherait une réconciliation est **sautée** (`action=skipped-reentrant`) ; le flag est réinitialisé après la stabilisation de la réconciliation en cours, quel que soit le résultat. De plus : après qu'un `model_switched` correctif de réconciliation se déclenche, affirmer que `getSessionContextStatus` est invoqué **exactement une fois** pour l'événement de stabilisation déclencheur — la publication corrective ne rentre PAS à nouveau dans le chemin de réconciliation (nombre d'appels borné).
- **Chemin d'échec convergé (§2.2) :** `model_switch_failed` se déclenche → la réconciliation lit `getSessionContextStatus` → retourne `entry.currentModelId` (inchangé) → aucun correctif émis (`action=converged`) ; état du bus inchangé.
- **Valeurs du compteur de génération (§2.3) :** après une séquence promotion → réconciliation → correctif, `entry.modelPublishGeneration` est égal à `gen_before + 2` (un pour la promotion initiale, un pour le correctif) ; `gen_before`/`gen_after` loggés dans l'observabilité correspondent aux valeurs du compteur à l'entrée/sortie de la réconciliation.
---

## 9. Décisions résolues (propriété de l'émetteur)

| Entrée                                              | chemin de l'agent                                                                   | via `Session.*` ?          | émetteur de portée session                                                            | publication workspace                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `POST /session/:id/model`                          | `unstable_setSessionModel` (`acpAgent.ts:925`) → `session.setModel` (`:935`) | ✅                            | **bridge** (`bridge.ts:2883`) ; notification de l'agent **supprimée pendant le roundtrip** | n/a                                        |
| attacher `applyModelServiceId`                       | même chemin                                                                    | ✅                            | **bridge** (`bridge.ts:1172`) ; supprimé pendant le roundtrip                        | n/a                                        |
| `/model` en session, plan-mode                     | `Session.setModel` directement                                                  | ✅                            | **agent** `current_model_update` → demux                                          | n/a (différé)                             |
| `POST /session/:id/approval-mode`                  | extMethod (`acpAgent.ts:2200`) → `config.setApprovalMode` (`:2228`)          | ❌ contourne `Session.setMode` | **bridge** (`bridge.ts:2979`) ; **aucune notification d'agent** (rien à supprimer)    | bridge, conditionné par `persist` (`bridge.ts:3007`) |
| ACP `setSessionMode` / `/approval-mode` en session | `acpAgent.ts:922` → `Session.setMode`                                        | ✅                            | **agent** `current_mode_update` → demux                                           | n/a                                        |

`model_switch_failed` est exclusif au bridge sur tous les chemins.

**Résolu : A2 conserve le contournement extMethod (ne PAS router le chemin HTTP approval-mode via `Session.setMode`).** C'était une question ouverte ; c'est un point critique (si on l'inverse, le chemin HTTP déclencherait une notification d'agent et l'indication de la §1.1 « aucune notification d'agent, rien à supprimer » deviendrait incorrecte, ce qui produirait un double emit). Décision : conserver le contournement — le bridge reste le seul émetteur pour HTTP approval-mode, aucune logique de suppression n'est nécessaire à cet endroit. Le réexaminer nécessiterait d'ajouter la logique de suppression + la dépendance `approvalModeQueue` à ce chemin, c'est donc explicitement hors périmètre.

## 10. Questions en suspens

1. **Miroir workspace A1 :** livrer le miroir workspace du modèle persisté différé, ou laisser le modèle de portée session de manière permanente ? (La portée de persistance elle-même est workspace ou utilisateur selon `getPersistScopeForModelSelection`.)
2. **Valeur par défaut A5 :** conserver `?snapshot=1` en opt-in plutôt que toujours activé pour les reconnexions.
3. **Réconciliation vs serialize-at-source (A1) — la cible sans race condition.** La pile suppress + best-effort-dedup + authoritative-reconciliation + generation-guard n'existe que parce que `/model` en session contourne `modelChangeQueue` et entre en concurrence avec les changements pilotés par le bridge. Router les changements de modèle en session via la **même** `modelChangeQueue` (afin que tous les changements de modèle soient sérialisés et publiés dans l'ordre) élimine la mécanique de suppress/dedup/reconcile et tous les TOCTOU qu'elle a engendrés — c'est la conception à long terme correcte. Ce n'est différé que parce que cela nécessite que le gestionnaire en session (`Session.setModel` → agent) se coordonne avec la file d'attente de l'entrée du bridge à travers la limite ACP, ce qui représente un changement plus important. D'ici là, la pile v10 est la mesure d'atténuation provisoire avec le comportement de race résiduel documenté ci-dessus. **Il est recommandé de planifier le refactor serialize-at-source plutôt que de durcir la réconciliation indéfiniment.**
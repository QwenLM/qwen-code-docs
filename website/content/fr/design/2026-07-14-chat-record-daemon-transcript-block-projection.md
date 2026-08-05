# Noyau de projection partagé des ChatRecords append-only vers DaemonTranscriptBlocks

## Statut du document

- Statut : Implémenté
- Date : 2026-07-14
- Date d'implémentation : 2026-07-15
- Périmètre : core, acp-bridge, cli, sdk-typescript, web-shell
- Entrée : enregistrements inconnus append-only déjà parsés depuis le JSONL par l'appelant
- Sortie : une projection `DaemonTranscriptBlock` avec diagnostics et informations d'exhaustivité

## Conclusion

Résultat de l'implémentation : la préparation des enregistrements, la machine de relecture ACP, les constructeurs purs live/replay, l'adaptateur CLI, la compaction sensible à la provenance, le normalisateur/reducer du SDK et la façade opt-in du SDK ont tous été livrés. Le bundle navigateur du démon par défaut reste dans son budget de 151 KiB ; le bundle navigateur minifié de transcription fait 67 730 octets. Les artefacts séparés daemon et daemon/transcript totalisent 222 335 octets, tandis qu'un artefact important les deux mesure 222 722 octets. Les 387 octets supplémentaires sont le surcoût du wrapper de modules combinés ; les appelants doivent donc traiter le sous-chemin transcript comme un coût opt-in explicite. Les baselines de performance synchrones et les recommandations Web Worker sont documentées dans le README du SDK.

Les appelants du navigateur utilisent un sous-chemin SDK opt-in séparé :

    import {
      projectChatRecordsToDaemonTranscript,
      type ChatRecordTranscriptProjection,
    } from "@qwen-code/sdk/daemon/transcript";

    const projection = projectChatRecordsToDaemonTranscript(records);
    const { blocks, diagnostics, complete, truncated } = projection;

Cette fonction synchrone ne démarre ni le démon, ni Express, ni un processus enfant ACP ; n'accède ni au système de fichiers, ni au réseau, ni au DOM, ni au stockage du navigateur ; et ne parse pas le texte JSONL. Elle accepte les enregistrements bruts append-only après `JSON.parse` et effectue en interne :

    validation runtime
      -> sélection de la feuille active
      -> reconstruction de la chaîne parentUuid
      -> agrégation des fragments de même UUID
      -> relecture de la transcription persistée
      -> normalisation SessionUpdate
      -> projection DaemonTranscriptBlock

L'implémentation partagée est divisée en trois modules profonds à propriété explicite :

    packages/core/src/utils/transcript-records.ts
      -> export de package @qwen-code/qwen-code-core/transcriptRecords
      -> préparation des enregistrements sûre pour le navigateur
      -> chaîne active, agrégation, trous, diagnostics

    packages/acp-bridge/src/transcript-replay.ts
      -> machine de relecture sûre pour le navigateur
      -> constructeurs purs partagés de SessionUpdate

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
      -> adaptateur SDK
      -> normalisateur/reducer/finalisation
      -> interface publique de projection

Le `HistoryReplayer` du CLI et les émetteurs live `MessageEmitter`, `ToolCallEmitter` et `PlanEmitter` réutilisent tous les constructeurs purs de mise à jour d'acp-bridge. Cela empêche la dérive de simplement passer de « CLI contre Web » à « live contre relecture » : l'interprétation des enregistrements et la construction des mises à jour ont chacune une seule implémentation.

L'adaptateur SDK enveloppe les mêmes valeurs `SessionUpdate` en valeurs `DaemonEvent` sans ID, réutilise le `normalizeDaemonEvent` existant et le reducer de transcription, et renvoie finalement `blocks`, `diagnostics`, `complete` et `truncated`.

## Contexte

Le scénario cible est le rendu en lecture seule dans le WebShell de JSONL persistés générés par `qwen -p`, par exemple :

    /root/.qwen/projects/-root--qwen-workspace/chats/<session-id>.jsonl

Le navigateur a déjà obtenu le contenu du fichier via un host, un sélecteur de fichiers ou un autre chemin de lecture fiable, et est responsable du parsing du texte JSONL en enregistrements inconnus. Le chemin complet après cela est :

    enregistrements append-only parsés
      -> préparation partagée des enregistrements
      -> relecture partagée de la transcription
      -> projection DaemonTranscriptBlock
      -> WebShellTranscript

Les appelants n'ont pas besoin de comprendre l'arbre `parentUuid`, la branche active après rewind, les fragments d'ajout de même UUID, les enregistrements d'artefacts de session, ni les trous d'historique. Laisser ces sémantiques de persistance aux appelants créerait un module peu profond : l'interface paraîtrait être une seule fonction, mais l'utiliser correctement exigerait des appelants qu'ils réimplémentent la connaissance de `SessionService`.

Cette conception n'utilise pas `compactedReplay`. C'est la fenêtre bornée de récupération en mémoire maintenue par le démon pour les sessions live ; cet utilitaire traite des enregistrements persistés explicitement fournis par l'appelant. La projection hors ligne n'a pas de limite de nombre de blocs par défaut, mais conserve la limite de sécurité pour un bloc de texte individuel et rapporte explicitement tout traitement avec perte via `diagnostics` et `truncated`.

## Baseline existante : comment le `/load` du démon rejoue le JSONL

Le `/load` actuel en mode response ne passe pas le JSONL directement au SDK. Le chemin complet est :

    SessionService.loadSession
      -> parsing JSONL
      -> dernière feuille non-artefact
      -> buildOrderedUuidChain
      -> aggregateRecords de même UUID
      -> ResumedSessionData.conversation.messages

    QwenAgent.loadSession
      -> collectHistoryReplayUpdates
      -> HistoryReplayer
      -> MessageEmitter / ToolCallEmitter / PlanEmitter
      -> SessionUpdate[] dans LOAD_REPLAY_META_KEY

    acp-bridge restoreSession
      -> extractLoadReplayResponse
      -> BridgeClient.seedSessionUpdates
      -> prepareSessionUpdateFrames
      -> EventBus.seedReplayEvents
      -> compactedReplay + liveJournal

    DaemonSessionClient.load
      -> replaySnapshot
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> DaemonTranscriptState.blocks

La première moitié du `/load` en mode stream est encore produite par `HistoryReplayer` ; les mises à jour entrent dans l'`EventBus` de restauration en attente sous forme de notifications ACP au lieu d'être incluses dans la réponse de chargement. Les deux modes passent finalement par la même préparation de trames du bridge, le même normalisateur et le même reducer.

L'implémentation actuelle a trois branches qui doivent converger :

- `SessionService` et `SessionTranscriptReader` ont chacun leur propre implémentation d'`aggregateRecords`.
- `SessionService` choisit le dernier enregistrement non-artefact comme feuille, tandis que `SessionTranscriptReader` choisit actuellement le dernier enregistrement structurellement valide. Leur sémantique diffère lorsqu'un artefact se trouve par hasard en fin de fichier.
- La relecture JSONL dépend des classes d'émetteurs du CLI, donc le navigateur ne peut pas la réutiliser sans embarquer `Config` et le runtime Node.

Cette conception ne crée pas de raccourci séparé JSONL-vers-blocs. Elle extrait plutôt la préparation des enregistrements sûre pour le navigateur et la construction des `SessionUpdate` du chemin ci-dessus, puis continue d'utiliser la queue de normalisation/réduction existante du démon.

## Objectifs

- Fournir une fonction synchrone, en mémoire et sûre pour le navigateur, qui projette les enregistrements bruts parsés vers une transcription.
- Consolider la sélection de la chaîne active, l'agrégation de même UUID et les trous d'historique dans un seul module de préparation des enregistrements.
- Faire partager à la relecture CLI, au chargement du démon et à la projection Web hors ligne les règles d'interprétation des enregistrements et de construction des `SessionUpdate`.
- Faire partager aux émetteurs live et à la machine de relecture les constructeurs purs de mise à jour pour préserver la localité live/relecture.
- Préserver les horodatages, l'identité des enregistrements source, l'ordre des parts, la corrélation début/résultat des outils, l'état de pagination et le nettoyage final des éléments en suspens.
- Produire une projection déterministe pour une entrée identique, en utilisant des fallbacks déterministes pour les champs qui ne dépendent pas du `Config` courant.
- Traiter le JSON persisté comme une entrée non fiable et distinguer les erreurs de l'appelant, la corruption récupérable et les valeurs inconnues à compatibilité future.
- Émettre des diagnostics structurés pour chaque saut, ambiguïté et troncature ; ne jamais présenter une projection partielle comme complète.

## Non-objectifs

- Lire des fichiers ou parser du texte JSONL.
- Simuler `EventBus`, les curseurs SSE, `Last-Event-ID` ou `compactedReplay`.
- Déduire depuis les enregistrements des blocs live-only non persistés tels que permission, shell, user_shell ou l'annulation.
- Embarquer dans le bundle navigateur le lecteur Node-only du core, les types de provider ou le runtime complet.
- Garantir une récupération non ambiguë des appels d'outils concurrents de même nom lorsqu'un ID d'appel persisté est absent.
- Renvoyer le store d'artefacts de session ; les artefacts restent un canal latéral séparé.
- Déplacer toute la hiérarchie de classes d'émetteurs du CLI dans une feuille partagée ; seuls les constructeurs purs de mise à jour sont partagés.

## Architecture

### 1. Module de préparation des enregistrements

La préparation des enregistrements appartient au modèle de session persistée du core. Ajouter une feuille sûre pour le navigateur :

    packages/core/src/utils/transcript-records.ts
      -> @qwen-code/qwen-code-core/transcriptRecords

Ce module :

- effectue une validation runtime des enregistrements inconnus ;
- sélectionne un `leafUuid` explicite, ou par défaut le dernier enregistrement de conversation valide non-artefact ;
- remonte de la feuille vers la racine à travers `parentUuid` ;
- s'arrête sur un parent manquant sans rejoindre une île antérieure, et produit un `HistoryGap` ;
- agrège les fragments de même UUID dans l'ordre de la chaîne active ;
- utilise les règles de fusion de champs actuellement utilisées par `SessionService` ;
- identifie les cycles, les valeurs `parentUuid` conflictuelles, les enregistrements corrompus et les enregistrements d'artefacts sautés ; et
- renvoie de nouveaux enregistrements de premier niveau et de nouveaux tableaux de parts sans modifier l'entrée. Les payloads imbriqués validés sont réutilisés comme valeurs en lecture seule plutôt que clonés en profondeur sans bénéfice.

Les tableaux complets et les index de streaming sont lus différemment, ils partagent donc les mêmes primitives sémantiques plutôt que de forcer `SessionTranscriptReader` à charger tout le fichier en mémoire :

    validateTranscriptRecord
    isTranscriptConversationRecord
    selectTranscriptLeaf
    walkTranscriptUuidChain(lookup)
    aggregateTranscriptRecordFragments

`prepareTranscriptRecords` compose ces primitives pour les tableaux bruts. `SessionService` utilise directement la fonction composée. `SessionTranscriptReader` conserve son index d'offsets d'octets et ses lectures paginées, mais utilise le même classifieur, le même parcours de chaîne par lookup et le même agrégateur. Le `buildOrderedUuidChain` existant est absorbé dans cette implémentation et ne doit pas subsister comme second parcours.

Cela supprime à la fois les deux implémentations d'`aggregateRecords` et corrige la divergence sémantique du lecteur lorsqu'un artefact est le dernier enregistrement, sans sacrifier son index de streaming ni ses lectures paginées.

Cette feuille ne peut importer que des types sûrs pour le navigateur et des fonctions pures. Elle ne doit pas importer `fs`, `path`, `Buffer`, la classe `ChatRecordingService`, ni le code runtime des providers.

Le core n'a actuellement pas d'exports map. L'implémentation doit préserver explicitement les exports de la racine, de `transcriptRecords`, de `package.json` et des imports profonds `./dist/*` existants. Ajouter une feuille navigateur ne doit pas accidentellement fermer les chemins `@qwen-code/qwen-code-core/dist/...` enregistrés comme compatibles par le dépôt.

### 2. Module de relecture de la transcription

La sémantique de `SessionUpdate` appartient à ACP, donc la machine de relecture et les constructeurs purs de mise à jour vivent dans :

    packages/acp-bridge/src/transcript-replay.ts
      -> @qwen-code/acp-bridge/transcriptReplay

Ce module masque :

- le dispatch par type/sous-type d'enregistrement ;
- l'ordre des parts de message ;
- la conversion du texte, de la réflexion, des images et des appels de fonction ;
- l'état début/résultat/en suspens des outils ;
- Todo/plan, diff/content, usage et provenance ;
- les résultats de notification, cron, message en cours de tour et slash command ;
- les métadonnées des enregistrements source ; et
- l'état de relecture paginée.

Supprimer ce module redistribuerait la complexité entre la relecture CLI, les émetteurs live et la projection SDK ; il passe donc le test de suppression et a une profondeur suffisante.

### 3. Constructeurs de mise à jour partagés

La machine de relecture ne duplique pas les règles existantes de construction de mise à jour dans `MessageEmitter`, `ToolCallEmitter` et `PlanEmitter`. La feuille acp-bridge fournit des constructeurs purs utilisés uniquement par les adaptateurs, tels que :

    createUserMessageUpdate
    createAgentMessageUpdate
    createAgentThoughtUpdate
    createUsageUpdate
    createToolCallStartUpdate
    createToolCallResultUpdate
    createPlanUpdate

Les constructeurs n'acceptent que des paramètres structurés et renvoient un `SessionUpdate`. Ils n'accèdent ni à `Config`, ni aux registres, ni à l'i18n, ni au réseau.

Émetteurs live du CLI :

    entrée runtime
      -> adaptateur de métadonnées CLI
      -> constructeur partagé
      -> sendUpdate

`HistoryReplayer` :

    ChatRecord préparé
      -> machine de relecture
      -> constructeur partagé
      -> sendUpdate

Projection hors ligne du SDK :

    ChatRecord préparé
      -> machine de relecture
      -> constructeur partagé
      -> DaemonEvent sans id
      -> normalisateur/reducer

Les aperçus de diff, l'extraction des Todos, la transformation du contenu d'outil, l'ordre usage-vers-plan et les fallbacks de provenance doivent vivre dans les constructeurs partagés ou leurs helpers privés. Les émetteurs live ne conservent que l'envoi asynchrone et l'enrichissement runtime.

### 4. Adaptateur de projection du SDK

La façade du SDK vit dans une entrée opt-in séparée :

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
    packages/sdk-typescript/src/daemon/transcript.ts
    @qwen-code/sdk/daemon/transcript

Elle réutilise le normalisateur et le reducer de l'UI du démon mais n'entre pas dans le bundle navigateur par défaut de `@qwen-code/sdk/daemon`. Les appelants ont seulement besoin d'installer le SDK et ne dépendent pas directement des sous-chemins core ou acp-bridge.

## Coutures de packages sûres pour le navigateur

Ajouter deux exports de feuille internes :

    @qwen-code/qwen-code-core/transcriptRecords
    @qwen-code/acp-bridge/transcriptReplay

Contraintes :

- Aucun import de built-ins Node au runtime.
- Aucun accès à `process`, `Buffer`, au DOM ni au stockage.
- Privilégier les imports type-only pour les packages de provider et ACP.
- L'entrée transcript du SDK inline l'implémentation dans le bundle publié.
- Les `.d.ts` publiés du SDK doivent inliner les types publics d'entrée/projection et ne doivent pas référencer un sous-chemin acp-bridge qui n'existe que comme dépendance de dev.
- Ajouter des gardes de built-ins Node pour les bundles core, acp-bridge et transcript du SDK.

## Interface de préparation des enregistrements

La façade publique du SDK accepte `readonly unknown[]`. Après validation interne, la feuille du core produit :

    export interface TranscriptRecordInput {
      readonly uuid: string;
      readonly parentUuid: string | null;
      readonly sessionId: string;
      readonly timestamp?: string;
      readonly type: "user" | "assistant" | "tool_result" | "system";
      readonly subtype?: string;
      readonly message?: {
        readonly role?: string;
        readonly parts?: readonly unknown[];
      };
      readonly usageMetadata?: unknown;
      readonly toolCallResult?: unknown;
      readonly systemPayload?: unknown;
    }

    export interface TranscriptReplayGapInput {
      readonly childUuid: string;
      readonly missingParentUuid: string;
    }

    export interface PreparedTranscriptRecords {
      readonly sessionId?: string;
      readonly records: readonly TranscriptRecordInput[];
      readonly gaps: readonly TranscriptReplayGapInput[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
    }

### Politique de validation

Les erreurs fatales de l'appelant lèvent directement `TranscriptProjectionInputError` et ne renvoient aucun résultat partiel :

    export type TranscriptProjectionInputErrorCode =
      | "invalid_records"
      | "invalid_max_blocks"
      | "leaf_not_found"
      | "mixed_session_ids";

    export class TranscriptProjectionInputError extends TypeError {
      readonly code: TranscriptProjectionInputErrorCode;
    }

- `records` n'est pas un tableau.
- `options.maxBlocks` n'est pas un entier sûr positif.
- Un `leafUuid` explicite n'existe pas.
- Deux valeurs `sessionId` ou plus, structurellement valides et différentes, sont mélangées dans une projection.

L'entrée du SDK exporte cette erreur de manière cohérente. L'erreur de validation interne du core est mappée à la frontière de la façade afin qu'une classe de package interne ne fuie pas dans le `.d.ts` public. En dehors de ces cas, un enregistrement individuel mal formé ne doit pas faire lever une exception à toute la projection.

Lorsqu'un enregistrement individuel ou un payload imbriqué est mal formé, préserver l'historique récupérable partout où c'est possible et émettre un diagnostic :

- Sauter les non-objets, les enregistrements sans UUID, les valeurs `parentUuid` invalides et les types d'enregistrement inconnus.
- Conserver les enregistrements avec des horodatages invalides, mais omettre `serverTimestamp` pour ces enregistrements.
- Pour des valeurs `parentUuid` conflictuelles entre fragments d'un UUID dupliqué, conserver le premier fragment et rapporter le conflit.
- Arrêter la chaîne et rapporter un trou lorsqu'un `parentUuid` est manquant.
- Arrêter la chaîne et rapporter un cycle lorsque les valeurs `parentUuid` forment un cycle.
- Sauter une part mal formée d'un type reconnu et marquer la projection comme incomplète.
- Sauter les sous-types/parts inconnus à compatibilité future et émettre un avertissement plutôt que de lever une exception.
- Sauter les sous-types système reconnus qui ne produisent pas de contenu de transcription, tels que `chat_compression`, `ui_telemetry`, `file_history_snapshot` et les enregistrements d'artefacts, selon la sémantique existante sans affecter `complete`.

Une entrée vide renvoie des `blocks` vides avec `complete` à `true`. Une entrée composée uniquement d'artefacts renvoie de même une transcription vide, avec un diagnostic informatif.

Un `leafUuid` explicite doit pointer vers un enregistrement de conversation. Ne correspondre qu'à un enregistrement d'artefact équivaut à une feuille inexistante. Les enregistrements d'artefacts n'entrent pas dans la chaîne UUID et ne participent pas à la détection de conflits de parent dupliqué.

### Diagnostics

    export interface TranscriptProjectionDiagnostic {
      readonly code: string;
      readonly severity: "info" | "warning" | "error";
      readonly message: string;
      readonly affectsCompleteness: boolean;
      readonly recordIndex?: number;
      readonly recordId?: string;
      readonly path?: string;
    }

Les messages de diagnostic ne doivent pas contenir d'arguments, de résultats, de tokens ou d'identifiants non dissimulés. Les appelants doivent brancher sur `code` ; `message` ne sert qu'à la journalisation et à la présentation par défaut.

`projection.complete` signifie :

- qu'aucun diagnostic n'a `affectsCompleteness` à `true` ;
- qu'aucune troncature de bloc ou de texte ne s'est produite ;
- que la finalisation de la relecture s'est terminée ; et
- qu'aucune corrélation d'outil ambiguë ne s'est produite.

La première version stabilise au moins les codes de diagnostic suivants. Les codes sont un contrat de compatibilité ; les messages ne le sont pas.

| code                            | affectsCompleteness | Signification                                 |
| ------------------------------- | ------------------- | --------------------------------------------- |
| invalid_record                  | true                | Un enregistrement entier a été sauté          |
| invalid_timestamp               | false               | Le contenu est conservé sans heure historique |
| conflicting_parent_uuid         | true                | Les fragments de même UUID ont des parents conflictuels |
| history_gap                     | true                | Un parent manque dans la chaîne active        |
| parent_cycle                    | true                | La chaîne active contient un cycle            |
| malformed_part                  | true                | Une part reconnue mal formée a été sautée     |
| unknown_record_or_part          | true                | Une extension inconnue peut contenir des données visibles |
| ambiguous_tool_call_correlation | true                | Un résultat d'outil ne peut pas être corrélé de manière unique |
| missing_tool_result             | true                | Un appel d'outil n'a pas de résultat persisté |
| presentation_fallback           | false               | L'adaptateur de présentation a échoué ; fallback utilisé |
| transcript_blocks_truncated     | true                | `maxBlocks` a supprimé des blocs plus anciens |
| transcript_text_truncated       | true                | Un bloc de texte a dépassé la limite de caractères |

Une entrée composée uniquement d'artefacts peut utiliser un diagnostic informatif sans affecter `complete`. Ajouter un code plus tard ne doit pas modifier la sémantique `affectsCompleteness` d'un code existant.

## Interface d'émission de la relecture

La couche partagée émet des valeurs `SessionUpdate` complètes et préserve la provenance de la projection :

    import type { SessionUpdate } from "@agentclientprotocol/sdk";

    export interface TranscriptReplayEmission {
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
      readonly emissionOrdinal: number;
      readonly update: SessionUpdate;
    }

Une émission correspond à la projection d'un enregistrement, donc la forme extérieure conserve un `sourceRecordId` au singulier. Une fois écrit dans `SessionUpdate`, il devient un tableau `sourceRecordIds` à un seul élément pour une fusion sûre par les opérations ultérieures de compaction/upsert.

    export interface TranscriptReplayUsageState {
      readonly promptTokens: number;
      readonly cachedTokens: number;
      readonly candidateTokens: number;
      readonly apiTimeMs: number;
    }

    export interface PendingTranscriptToolCall {
      readonly callId: string;
      readonly toolName: string;
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
    }

    export interface TranscriptReplayStateV1 {
      readonly v: 1;
      readonly pendingToolCalls: readonly PendingTranscriptToolCall[];
      readonly cumulativeUsage: TranscriptReplayUsageState;
    }

    export interface TranscriptReplayMachineOptions {
      readonly initialState?: TranscriptReplayStateV1;
      readonly gaps?: readonly TranscriptReplayGapInput[];
      readonly presentation?: TranscriptReplayPresentationAdapter;
      readonly onDiagnostic?: (
        diagnostic: TranscriptProjectionDiagnostic,
      ) => void;
    }

L'état de relecture doit être versionné, et `snapshot` renvoie une copie détachée. Les entrées en attente mal formées dans `initialState` sont filtrées avec un diagnostic ; un usage invalide ou non fini est remis à zéro avec un diagnostic. Une version d'état inconnue est directement rejetée pour éviter de continuer la pagination avec un état incorrect.

Pour la compatibilité avec les curseurs de transcription émis avant le déploiement, un état legacy sans `v` est directement promu en v1 lorsqu'il correspond strictement à la forme actuelle `{ pendingToolCalls, cumulativeUsage }`. Un `v` explicite inconnu est toujours rejeté. La branche legacy ne parse que cette seule forme publiée et n'évolue pas vers un second schéma d'état.

## Machine de relecture incrémentale

    export interface TranscriptReplayMachine {
      project(
        record: TranscriptRecordInput,
      ): Iterable<TranscriptReplayEmission>;
      finalize(): Iterable<TranscriptReplayEmission>;
      snapshot(): TranscriptReplayStateV1;
    }

    export function createTranscriptReplayMachine(
      options?: TranscriptReplayMachineOptions,
    ): TranscriptReplayMachine;

`project` renvoie un itérateur paresseux. Le CLI attend immédiatement `sendUpdate` après avoir obtenu chaque émission et ne demande l'émission suivante qu'après la réussite de l'envoi. Les changements d'état après un `yield` du générateur ne sont donc validés qu'après la réussite de l'envoi précédent.

L'interface doit documenter explicitement ces contraintes d'itération :

- Les adaptateurs doivent itérer complètement chaque valeur renvoyée par `project`.
- Après l'échec d'envoi d'une émission ordinaire, arrêter l'enregistrement courant et tous les enregistrements suivants.
- Préserver le timing actuel de suppression d'un résultat d'outil en attente.
- N'ajouter un début d'outil aux en attente qu'après son envoi réussi.
- Valider l'usage avant que le constructeur de plan associé ne lise les valeurs cumulées.
- `finalize` est idempotent ; son second appel renvoie un itérateur vide.
- L'adaptateur CLI pour `finalize` doit capturer les erreurs d'envoi individuellement, continuer à tenter le nettoyage des éléments en suspens restants, et conserver la première erreur de nettoyage.
- Continuer à utiliser `AggregateError` lorsqu'une erreur de relecture et une erreur de nettoyage existent toutes deux.

L'adaptateur SDK n'a pas d'échec d'envoi asynchrone externe et peut consommer complètement chaque itérateur.

## Corrélation des appels d'outils

Les IDs d'appel suivent cette priorité :

1. Un ID explicitement persisté dans `functionCall.id`, `toolCallResult.callId` ou `functionResponse.id`.
2. Si un début n'a pas d'ID explicite, générer un ID synthétique stable avec un préfixe réservé qui inclut l'UUID de l'enregistrement source et l'index de la part.
3. Si un résultat n'a pas d'ID explicite, ne le corréler que lorsqu'exactement un appel en attente a le même nom.
4. Lorsqu'aucun appel en attente ou plusieurs appels en attente ont ce nom, ne pas deviner. Générer un ID de résultat synthétique indépendant et émettre un diagnostic `ambiguous_tool_call_correlation`.
5. Traiter les débuts non corrélés comme des outils en suspens pendant `finalize`.

Les IDs synthétiques utilisent le préfixe `qwen-replay-tool:`. La machine vérifie leurs collisions avec les IDs explicites et les IDs synthétiques antérieurs, en ajoutant un suffixe stable d'occurrence en cas de collision.

Un fallback stable garantit uniquement une identité déterministe ; il ne peut pas garantir une corrélation correcte lorsque l'information est absente.

## Provenance des enregistrements source

L'identité des enregistrements doit traverser le CLI, le démon et le SDK plutôt que de n'exister que sur l'émission extérieure. Un bloc de texte provient généralement d'un enregistrement, tandis qu'un bloc d'outil absorbe à la fois les enregistrements de début et de résultat ; les événements wire et les blocs utilisent donc un tableau ordonné et dédupliqué. Les constructeurs de relecture ajoutent ceci à `SessionUpdate._meta` :

    {
      qwenTranscript: {
        sourceRecordIds: ["..."]
      },
      timestamp: 1783958400000
    }

Contraintes :

- Les `sourceRecordIds` ne sont pas des IDs `EventBus` et ne doivent pas être écrits dans `event.id` ni participer à `Last-Event-ID`.
- Convertir `sourceTimestamp` en valeur d'époque finie en millisecondes à la couture de l'adaptateur et continuer à réutiliser le champ `timestamp` existant.
- Une émission de trou d'historique utilise `[gap.childUuid]` et l'horodatage de l'enregistrement enfant.
- Les émetteurs live sans contexte d'enregistrement persisté n'écrivent pas `qwenTranscript`.
- Le normalisateur promeut `sourceRecordIds` depuis `qwenTranscript`, puis supprime l'objet de transport interne des métadonnées de présentation.
- Ajouter `sourceRecordIds` optionnel en lecture seule à `DaemonUiEventBase` et `DaemonTranscriptBlockBase`.
- Le reducer ne fusionne texte/réflexion/image que lorsque les `sourceRecordIds` sont égaux et que toutes les autres conditions de fusion sont satisfaites.
- Les blocs d'outil continuent de faire un upsert par `toolCallId` et d'unir les `sourceRecordIds` dans l'ordre des événements. Les blocs plan et autres blocs à upsert utilisent la même règle d'union stable.
- La clé de slot de texte du moteur de compaction inclut aussi `sourceRecordIds`, empêchant les fusions à travers les frontières d'enregistrement.
- Lorsque le moteur de compaction fusionne le même `toolCallId`, il doit unir de manière stable `qwenTranscript.sourceRecordIds` ; les métadonnées de résultat ne doivent pas écraser la provenance du début.
- Comparer et indexer `sourceRecordIds` avec une égalité structurée et des `Map`, et non une concaténation par délimiteur non échappé qui permettrait à un UUID malveillant de provoquer des collisions de clés.
- Les événements live sans `qwenTranscript` conservent le comportement de compaction actuel.

Cela préserve une segmentation identique des enregistrements pour les deux modes de `/load` du démon et pour la projection hors ligne, afin que les tests de conformité n'aient pas besoin d'un contexte `activeRecordId` réservé aux tests.

## Couture d'adaptateur pour les données de présentation mutables

    export interface TranscriptReplayPresentationAdapter {
      resolveToolMetadata(
        toolName: string,
        args: Readonly<Record<string, unknown>>,
      ): TranscriptReplayToolMetadata;

      formatHistoryGap(gap: TranscriptReplayGapInput): string;
    }

- L'adaptateur CLI utilise le `Config`/registre d'outils courant pour résoudre le titre, le type et les emplacements, et utilise l'i18n du CLI pour formater les trous d'historique.
- L'adaptateur navigateur utilise des fallbacks déterministes : le titre est le nom de l'outil plus un argument de description persisté, le type est `other`, les emplacements sont vides, et les trous d'historique utilisent un texte SDK fixe.

Si l'adaptateur lève une exception, la machine de relecture utilise un fallback déterministe et émet un diagnostic au lieu de laisser l'enrichissement de présentation terminer toute la transcription.

La provenance, Todo/diff/content, l'usage et la corrélation des appels n'appartiennent pas à cette couture et doivent être décidés par l'implémentation partagée.

## Adaptateur CLI

`HistoryReplayer` conserve son interface d'appel existante mais est réduit à un adaptateur asynchrone :

    enregistrements préparés
      -> amorçage de l'état de relecture
      -> machine.project(record)
      -> await sendUpdate(emission.update) dans l'ordre
      -> machine.finalize() lorsque demandé
      -> copie de machine.snapshot()
      -> effacement du contexte de relecture actif

Le comportement suivant reste dans le CLI :

- l'enrichissement par `Config`/registre d'outils ;
- le texte localisé des trous d'historique du CLI ;
- `messageRewriter.interceptUpdate` ;
- le traitement asynchrone des échecs de `sendUpdate` ;
- la combinaison des erreurs de relecture et des erreurs de nettoyage des éléments en suspens dans une `AggregateError` ; et
- les goals live-only, les stop hooks et les autres événements non persistés.

Les chemins de chargement, de transcription paginée et d'export doivent utiliser la même préparation des enregistrements et la même machine de relecture afin que le même JSONL ne produise pas des valeurs `SessionUpdate` différentes selon les points d'entrée.

## Interface de transcription du SDK

    export interface ChatRecordTranscriptOptions {
      readonly leafUuid?: string;
      readonly maxBlocks?: number;
    }

    export interface ChatRecordTranscriptProjection {
      readonly blocks: readonly DaemonTranscriptBlock[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
      readonly complete: boolean;
      readonly truncated: boolean;
    }

    export function projectChatRecordsToDaemonTranscript(
      records: readonly unknown[],
      options?: ChatRecordTranscriptOptions,
    ): ChatRecordTranscriptProjection;

Lorsque `options.maxBlocks` est omis, la projection hors ligne ne réduit pas le nombre de blocs. Une valeur explicite doit être un entier sûr positif. Lorsque la réduction se produit :

- `truncated` est à `true` ;
- `complete` est à `false` ;
- `diagnostics` inclut `transcript_blocks_truncated` ; et
- les index d'outils, de permissions et de parents continuent de suivre les règles de nettoyage sûr du reducer.

L'adaptateur hors ligne passe explicitement `Number.MAX_SAFE_INTEGER` par défaut. Il ne modifie pas `DEFAULT_MAX_BLOCKS` du `createDaemonTranscriptState` en ligne et ne place pas `Infinity` dans l'état du reducer.

Le chemin d'événements de l'adaptateur SDK est :

    TranscriptReplayEmission
      -> DaemonEvent sans id (type = session_update)
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> finalizeOfflineDaemonTranscriptState
      -> ChatRecordTranscriptProjection

Les événements n'ont pas d'ID car ils ne proviennent pas de l'`EventBus`. `sourceTimestamp` devient `serverTimestamp`, et `sourceRecordIds` restent une provenance de projection séparée.

L'adaptateur hors ligne utilise une horloge de reducer fixe à `0`, empêchant `Date.now` d'entrer dans des champs observables. La même entrée, les mêmes options et le même adaptateur de présentation doivent produire une projection profondément égale ; `serverTimestamp` représente l'heure historique réelle.

Le nouveau `finalizeOfflineDaemonTranscriptState` privé effectue uniquement le nettoyage de la projection hors ligne et n'est pas exporté depuis l'entrée daemon par défaut :

- mettre `streaming` à `false` pour les blocs assistant/réflexion actifs ;
- effacer les pointeurs de texte actifs ;
- ne pas fabriquer d'événement wire ni de bloc visible ; et
- ne pas modifier les statuts d'outil finalisés.

Un bloc de texte individuel continue d'utiliser la limite de caractères de sécurité du SDK. Lorsqu'une troncature de caractères se produit, le hook de diagnostic du reducer doit rapporter `transcript_text_truncated` et définir `truncated=true` et `complete=false` ; il ne doit pas s'appuyer uniquement sur un suffixe visible `[truncated]`.

Pour rendre la troncature de bloc/texte observable, ajouter un `onTruncation(detail)` optionnel à `DaemonTranscriptReducerOptions`. Le détail inclut au moins le type, l'ID du bloc et `sourceRecordIds` lorsqu'ils sont présents. Les stores ordinaires ne passent pas ce callback ; l'adaptateur hors ligne collecte et déduplique les détails dans les diagnostics de projection. Ne pas déduire la troncature en recherchant `[truncated]`, car le texte utilisateur peut contenir le même suffixe.

## Sécurité des identifiants non fiables

Les UUIDs, les IDs d'appel et les IDs de parent dans l'entrée hors ligne sont des chaînes non fiables. Avant l'intégration, modifier ces index du reducer de transcription pour utiliser des `Map` ou des objets à prototype nul :

- `blockIndexById` ;
- `toolBlockByCallId` ;
- `permissionBlockByRequestId` ;
- `activeAssistantBlockByParent` ;
- `activeThoughtBlockByParent` ; et
- les maps de notifications réduites.

Les tests doivent couvrir `__proto__`, `constructor`, `prototype`, `toString` et les IDs trop longs pour garantir qu'ils ne peuvent pas casser le lookup, les relations parent-enfant ni le nettoyage de réduction.

## Artefacts

Le constructeur de résultat d'outil peut continuer à placer les artefacts persistés dans les métadonnées de `SessionUpdate` pour le canal latéral d'artefacts du bridge du démon. `DaemonTranscriptBlock` n'a cependant pas de champ d'artefact, et la projection hors ligne du SDK ne renvoie pas de store d'artefacts.

La conformité est donc divisée en deux couches :

- La conformité `SessionUpdate` inclut les artefacts.
- La conformité `DaemonTranscriptBlock` ignore explicitement le canal latéral des artefacts.

Si `WebShellTranscript` a besoin de cartes d'artefacts à l'avenir, ajouter une projection d'artefacts séparée plutôt que de faire passer clandestinement les artefacts dans les blocs de transcription.

## Contrat de cohérence

### Comportements fortement cohérents

La relecture CLI et la projection hors ligne du SDK partagent la machine, donc les éléments suivants doivent correspondre :

- la chaîne active et l'agrégation de même UUID ;
- le filtrage des enregistrements/sous-types et l'ordre des mises à jour ;
- les formes prises en charge de texte/réflexion/image des messages et l'ordre des parts ;
- les IDs d'appels d'outils et l'état début/résultat/en suspens ;
- Todo/plan, diff/content et entrée/sortie brutes ;
- l'usage, l'usage d'exécution de tâche et l'ordre des statistiques de plan ;
- les positions d'insertion des notifications, crons, messages en cours de tour, slash commands et trous ; et
- les horodatages, `sourceRecordIds` et les diagnostics de relecture.

Les émetteurs live et la machine de relecture partagent les constructeurs de mise à jour, donc les champs de `SessionUpdate` générés pour le même événement sémantique doivent correspondre.

### Différences d'adaptateur explicitement autorisées

- Le titre, le type et les emplacements d'outil calculés depuis le `Config`/registre d'outils courant du CLI.
- Le texte des trous d'historique dans la locale courante du CLI.
- Les messages dérivés ajoutés par la réécriture de messages du CLI.
- Le canal latéral des artefacts.
- Les événements live-only de permission, shell, annulation et session.

Si le produit exige des métadonnées d'outil identiques champ par champ, les métadonnées de relecture doivent être persistées au moment où l'appel d'outil est enregistré et suivre « valeur persistée d'abord, fallback déterministe ». La vérité historique ne doit pas être recalculée depuis le registre courant.

## Tests de conformité

Les tests ont six couches :

1. Tests golden de préparation des enregistrements du core : fixtures append-only brutes vers chaîne active, agrégation, trous et diagnostics.
2. Tests des constructeurs acp-bridge : les entrées live/relecture assertent des valeurs `SessionUpdate` complètes.
3. Tests de machine de relecture/compaction : ordre, état versionné, pagination, IDs synthétiques, corrélation ambiguë, finalisation et rétention de `sourceRecordIds` pendant la compaction texte/outil.
4. Tests de régression de l'adaptateur CLI : envoi asynchrone, réécriture de messages, échec partiel, nettoyage des éléments en suspens et `AggregateError`.
5. Tests de projection du SDK : événements sans ID, `sourceRecordIds`, normalisation, segmentation des enregistrements, troncature, identifiants malveillants et blocs déterministes.
6. Conformité inter-packages : la même fixture brute passe à travers la relecture CLI réelle et la projection hors ligne du SDK.

Chemins inter-packages :

    enregistrements bruts
      -> SDK projectChatRecordsToDaemonTranscript
      -> sdkProjection

    enregistrements bruts
      -> préparation partagée des enregistrements
      -> CLI HistoryReplayer
      -> SessionUpdate capturé avec les métadonnées qwenTranscript
      -> normalisateur/reducer/finalisation du SDK
      -> cliProjection

Effectuer une égalité profonde sur la projection canonique. Le canoniseur ne peut ignorer que les différences d'adaptateur explicitement autorisées ; il ne doit pas supprimer `sourceRecordIds`, les horodatages, le statut des outils, les diagnostics ni la troncature.

Ajouter aussi des fixtures d'intégration du démon qui vérifient que la relecture retenue de `/load` en mode response et en mode stream correspond à la projection hors ligne lorsqu'aucune troncature de fenêtre ne se produit. Les tests doivent franchir une frontière de tour ultérieure pour couvrir la rétention par le bridge/compaction des métadonnées et horodatages `qwenTranscript`.

## Intégration avec WebShellTranscript

    import { useMemo } from "react";
    import {
      projectChatRecordsToDaemonTranscript,
    } from "@qwen-code/sdk/daemon/transcript";
    import { WebShellTranscript } from "@qwen-code/web-shell";

    function ReadonlyHistory({ records }: { records: readonly unknown[] }) {
      const projection = useMemo(
        () => projectChatRecordsToDaemonTranscript(records),
        [records],
      );

      return (
        <>
          {projection.complete ? null : (
            <TranscriptDiagnostics diagnostics={projection.diagnostics} />
          )}
          <WebShellTranscript blocks={projection.blocks} />
        </>
      );
    }

Le SDK possède la préparation des données et la projection ; le WebShell ne possède que le rendu en lecture seule. `WebShellTranscript` n'ajoute pas de prop `records` et ne démarre ni provider, ni session, ni connexion réseau.

## Contrat de performance synchrone

La façade publique est une projection synchrone O(enregistrements + parts) et scanne toute l'entrée même si un `maxBlocks` explicite ne conserve finalement que les blocs de fin. `maxBlocks` limite la mémoire de sortie, pas le calcul.

Avant l'implémentation, établir des baselines de temps et de mémoire de pointe en utilisant des fixtures réelles petites, moyennes et grandes, et documenter la limite recommandée du thread principal dans la documentation du SDK. Les hosts au-delà de cette limite doivent invoquer la même interface sûre pour le navigateur dans un Web Worker et passer la projection au thread principal.

La première version n'ajoute pas de wrapper async/worker séparé. Reconsidérer cet adaptateur après l'apparition d'un second appelant réel, en évitant une fausse couture avec un seul adaptateur.

## Contraintes de bundle et de publication

Le convertisseur n'entre pas dans le bundle par défaut de `@qwen-code/sdk/daemon`. Ajouter cet export de package :

    "./daemon/transcript": {
      "types": "./dist/daemon/transcript.d.ts",
      "import": "./dist/daemon/transcript.js",
      "require": "./dist/daemon/transcript.cjs"
    }

Exigences de build :

- Des bundles séparés ESM navigateur et CJS Node.
- Une garde séparée de built-ins Node.
- Un budget de taille séparé avec le commit de baseline et la commande de mesure enregistrés.
- Les fichiers `.d.ts` publics ne fuient pas les dépendances de dev core/acp-bridge.
- Mesurer le code dupliqué dans un build d'exemple qui importe à la fois `daemon` et `daemon/transcript`.
- Ne pas compter sur l'import de la racine du package ni sur un tree shaking fortuit pour la sécurité navigateur.

Le budget daemon par défaut de 151 KiB n'augmente pas pour cette fonctionnalité.

## Ordre de migration

1. Ajouter la feuille sûre pour le navigateur de préparation des enregistrements de transcription au core, et faire partager à `SessionService` et `SessionTranscriptReader` la classification, la sélection de feuille, le parcours de chaîne et l'agrégation.
2. Ajouter les constructeurs purs de `SessionUpdate` à acp-bridge et y migrer progressivement les émetteurs live.
3. Ajouter la machine de relecture et les tests golden.
4. Convertir `HistoryReplayer` en adaptateur CLI tout en préservant son interface d'appel existante et sa sémantique d'erreur.
5. Ajouter les métadonnées `qwenTranscript` et étendre le traitement de `sourceRecordIds` par le bridge, la compaction, le normalisateur et le reducer.
6. Durcir les index d'identifiants non fiables du reducer et les diagnostics de troncature.
7. Ajouter la façade opt-in `daemon/transcript` et des artefacts de publication séparés au SDK.
8. Ajouter la conformité inter-packages et les fixtures d'intégration du démon.
9. Connecter la page en lecture seule du WebShell à `projection.blocks` et afficher les diagnostics.

À chaque étape, migrer les consommateurs existants avant de supprimer l'ancienne implémentation afin qu'aucune étape n'ait deux ensembles de règles de chaîne active, d'agrégation ou de constructeurs de mise à jour simultanément.

## Taille de code estimée

- Préparation des enregistrements du core et migration des deux consommateurs existants : environ 180–280 lignes de code de production.
- Constructeurs acp-bridge et machine de relecture : environ 400–550 lignes.
- Adaptateur CLI `HistoryReplayer` : environ 60–100 lignes.
- Façade de projection du SDK, identité et glue de diagnostics : environ 140–220 lignes.
- Prise en charge sécurité/troncature du reducer : environ 60–120 lignes.
- Le reste est principalement des fixtures, des tests de régression et des tests de conformité.

Il s'agit d'un changement core inter-packages. Un mainteneur doit confirmer le périmètre selon la porte de triage core du dépôt avant l'implémentation. L'agrégation ou les constructeurs de mise à jour dupliqués ne doivent pas être conservés simplement pour réduire le nombre de lignes.

## Périmètre avec perte

La projection ne peut récupérer que l'information présente dans les enregistrements. Les éléments suivants sont explicitement irrécupérables ou potentiellement avec perte :

- les blocs live-only tels que permission, shell, user_shell et prompt_cancelled ;
- le store d'artefacts de session ;
- la vérité historique du `Config`/registre/locale courant ;
- les fileData binaires/audio/non pris en charge ;
- l'imbrication des sous-agents d'ancienne sidechain sans `parentToolCallId` ;
- la corrélation exacte lorsque les IDs d'appel explicites sont absents et que plusieurs outils de même nom sont en attente ;
- le contenu au-delà de la limite de caractères de sécurité d'un bloc de texte individuel ;
- les blocs plus anciens supprimés par un `maxBlocks` explicite fourni par l'appelant ; et
- le contenu sauté à cause d'une entrée corrompue, d'extensions inconnues ou d'une chaîne cassée.

Chaque cas affectant l'exhaustivité doit émettre un diagnostic et définir `complete=false`. Chaque réduction réelle doit aussi définir `truncated=true`.

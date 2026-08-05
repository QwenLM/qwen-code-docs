# Événements de préparation des appels d'outils

## Contexte

Qwen Code émet actuellement un appel d'outil uniquement après que le provider a fini
de streamer ses arguments. Pour les outils avec des entrées volumineuses ou complexes,
générer ces arguments peut prendre bien plus de temps que l'exécution de l'outil lui-même.
Les clients ACP ne montrent donc aucune activité pendant la partie coûteuse, et les
utilisateurs peuvent prendre le tour pour une requête bloquée.

Les streams des providers exposent déjà une identité stable de l'outil avant que les
arguments ne soient complets :

- Anthropic envoie `id` et `name` dans `content_block_start` pour un bloc `tool_use`,
  puis envoie les fragments d'arguments sous forme d'`input_json_delta`.
- Les providers compatibles OpenAI envoient normalement `id` et `function.name` dans le
  premier élément `choice.delta.tool_calls`, puis ajoutent les fragments d'arguments.

Qwen Code attend volontairement `content_block_stop` ou `finish_reason`
avant de construire un `functionCall` compatible Gemini. Cette propriété de sécurité
d'exécution doit rester inchangée.

## Objectif

Permettre aux clients ACP de rendre une carte d'outil pendant que le modèle prépare encore
les arguments de l'outil, avec ce cycle de vie :

```text
preparing -> in_progress -> completed | failed
```

L'événement précoce ne contient que l'ID stable de l'appel d'outil et le nom de l'outil. Il
ne contient jamais d'arguments partiels et ne démarre jamais l'exécution de l'outil.

## Périmètre

Cette modification prend en charge les deux chemins de provider utilisés par le client intégrateur :

- Les réponses streaming Anthropic et compatibles Anthropic.
- Les réponses streaming OpenAI et compatibles OpenAI.

Les autres providers conservent leur comportement actuel. Les métadonnées de préparation étant
optionnelles, ils dégradent naturellement vers le cycle de vie existant
`in_progress -> completed | failed`.

La modification n'altère pas :

- les vérifications de permission des outils ;
- l'ordre des hooks ;
- la planification ou l'exécution des outils ;
- l'historique de conversation du modèle ;
- la construction de `functionCall` ou `functionResponse` ;
- les formats de sortie non ACP.

## Conception

### 1. Métadonnées internes de réponse

Associer des métadonnées transitoires de préparation d'outil à chaque
`GenerateContentResponse` via une `WeakMap` locale au module :

```ts
interface ToolCallPreparation {
  callId: string;
  toolName: string;
}
```

Les adaptateurs de provider stockent ces métadonnées contre le chunk de réponse de premier niveau.
Ce n'est ni une propriété énumérable de la réponse ni une `Part` Gemini, donc elles ne sont
pas sérialisées et l'assemblage de l'historique Gemini continue de ne voir que les parts
de texte, de réflexion et les `functionCall` complets. Des helpers partagés fournissent des
opérations typées de stockage et de lecture, évitant les casts spécifiques au provider dans ACP.

### 2. Producteur Anthropic

Dans `AnthropicContentGenerator.processStream()`, lorsque
`content_block_start(tool_use)` contient un `id` et un `name` non vides, émettre un
chunk de réponse Gemini par ailleurs vide portant une entrée de préparation.

Continuer d'accumuler les `input_json_delta` sans changement. À `content_block_stop`,
émettre le `functionCall` complet existant avec les arguments parsés. Aucune donnée
d'argument n'est exposée avant ce point.

### 3. Producteur compatible OpenAI

Dans `convertOpenAIChunkToGemini()`, observer chaque élément
`choice.delta.tool_calls` après l'avoir transmis au parser local au stream existant pour les
appels d'outils. Lorsqu'un ID et un nom stables non vides sont disponibles pour la
première fois, attacher une entrée de préparation au chunk de réponse courant.

Dédupliquer par ID d'appel d'outil dans le contexte de la requête. Continuer de n'émettre le
`functionCall` complet que lorsque `finish_reason` est présent. Les providers qui
n'exposent pas tôt les deux champs d'identité conservent simplement le comportement existant.

### 4. Consommateur ACP et transitions d'état

La `Session` ACP lit les métadonnées de préparation avant de collecter les
`functionCalls` complets. Pour chaque nouvelle préparation, elle émet la trame ACP standard
`tool_call` avec :

```ts
{
  status: 'pending',
  rawInput: {},
  _meta: {
    phase: 'preparing',
    toolName,
    // les métadonnées de provenance existantes restent présentes
  },
}
```

Le chemin d'exécution existant émet ensuite le même `toolCallId` avec
`status: 'in_progress'` et les arguments complets. L'émission existante du résultat
termine alors la carte en `completed` ou `failed`.

`TodoWrite` conserve son traitement spécial actuel et n'émet pas de carte d'outil.
L'émission de préparation utilise la même règle de filtrage, elle ne peut donc pas créer une carte
que le chemin d'exécution supprime intentionnellement.

### 5. Retry, fallback, annulation et échec de stream

Chaque stream de modèle ACP actif suit les préparations jusqu'à ce que le stream se termine et
transmette ses appels parsés à l'exécution des outils. Lorsqu'une tentative est abandonnée par
retry, fallback de modèle, annulation utilisateur ou erreur de stream, ACP émet un
`tool_call_update` terminal pour chaque entrée restante :

```ts
{
  status: 'failed',
  content: [],
  _meta: {
    phase: 'preparing',
    preparationDiscarded: true,
    toolName,
  },
}
```

`preparationDiscarded` signifie que la tentative du modèle a été abandonnée avant qu'une requête
d'outil parsée n'atteigne l'exécution. Ce n'est pas un échec d'exécution d'outil. Le client
intégrateur doit retirer cette carte transitoire plutôt que de rendre un outil en échec.
Utiliser un statut terminal valide du protocole garantit que les anciens clients ne conservent pas
une carte indéfiniment en attente.

`RETRY` efface désormais les `functionCalls` complets collectés depuis la tentative abandonnée,
en accord avec le comportement existant de `MODEL_FALLBACK` sur les quatre chemins de stream ACP.
Cela empêche un appel parsé de la tentative échouée d'être exécuté avec les appels de la
tentative de remplacement.

Lorsqu'un `functionCall` complet avec le même ID arrive et que le stream se termine
normalement, ACP le transmet au chemin d'exécution existant sans mise à jour discarded.
Si le stream échoue après le parsing de l'appel mais avant l'exécution, la
préparation est tout de même abandonnée. Les erreurs normales d'outil continuent donc par
le chemin de résultat existant et ne sont jamais marquées comme abandonnées.

## Impact en aval

- `GeminiChat` et les constructeurs d'historique ignorent les métadonnées optionnelles de premier
  niveau et continuent de ne persister que le contenu candidat.
- Une réponse ne contenant que des métadonnées de préparation n'est pas comptée comme une sortie
  visible par l'utilisateur, donc le retry de transport et le fallback de modèle conservent leur
  comportement existant avant sortie.
- Les IDs de préparation utilisent la même normalisation inter-tours que les IDs complets de
  `functionCall`, préservant la corrélation des mises à jour ACP lorsqu'un provider réutilise
  un ID de l'historique.
- Le `Turn` core, le TUI et les consommateurs JSON non interactifs conservent leur comportement
  actuel car aucune nouvelle `Part` Gemini ni événement serveur n'est introduit.
- ACP est le seul consommateur qui opte pour les métadonnées et émet l'état UI précoce.
- Le même contrat de métadonnées est partagé par les adaptateurs Anthropic et compatibles
  OpenAI, donc ACP n'a pas de branches spécifiques au provider.

## Plan de test

### Tests des providers core

- Anthropic : un `content_block_start(tool_use)` émet des métadonnées de préparation
  avant tout `input_json_delta` et avant le `functionCall` final.
- Anthropic : un ID ou un nom manquant n'émet pas de métadonnées de préparation.
- Compatible OpenAI : le premier delta avec un ID et un nom stables émet une
  entrée de préparation ; les deltas d'arguments suivants ne la dupliquent pas.
- Compatible OpenAI : les appels complets n'apparaissent toujours qu'à `finish_reason`, avec
  des arguments parsés inchangés.
- Compatible OpenAI : l'absence des champs d'identité précoces retombe sur le comportement
  actuel sans événement de préparation invalide.
- GeminiChat : les chunks ne contenant que des préparations ne suppriment ni le retry de transport,
  ni le fallback du modèle primaire, ni la continuation à travers une chaîne de fallback multi-modèles.
- GeminiChat : les IDs de provider dupliqués entre tours sont normalisés de manière cohérente dans
  les métadonnées de préparation et les appels complets.

### Tests ACP

- Les métadonnées de préparation émettent `pending` avec `_meta.phase = 'preparing'` et
  aucune entrée partielle.
- L'appel complet réutilise le même ID et passe à `in_progress` avec
  les arguments complets.
- Le retry, le fallback, l'annulation et l'erreur de stream abandonnent les préparations qui
  n'ont pas atteint l'exécution d'outil avec `_meta.preparationDiscarded = true`.
- Le retry et le fallback de modèle effacent les appels complets collectés depuis la tentative
  abandonnée avant d'accepter les chunks de remplacement.
- Une préparation devenue un appel complet n'est pas abandonnée après un stream terminé
  normalement, mais l'est si ce stream échoue avant l'exécution.
- `TodoWrite` reste supprimé.

### Vérification de régression

Exécuter les suites ciblées des providers et d'ACP depuis leurs répertoires de package, puis
exécuter le build, le typecheck et le lint du dépôt avant de terminer. L'implémentation
rebasée sur la v0.19.9 a été vérifiée avec :

- Suites des providers et streams core : 649 réussites.
- Suites du cycle de vie ACP : 316 réussites.
- Build du dépôt, typecheck des workspaces et lint complet : réussites.
- Prettier des fichiers modifiés et vérifications de diff : réussites.

## Critères d'acceptation

1. Les tours ACP Anthropic et compatibles OpenAI émettent une carte d'outil en attente dès que
   l'identité stable de l'outil est disponible.
2. Aucun outil ne démarre avant que les arguments complets et les chemins existants de permission
   et d'exécution ne s'exécutent.
3. Les appels et résultats complets conservent leurs IDs, arguments, ordre
   et représentation dans l'historique actuels.
4. Les tentatives abandonnées ne laissent aucune carte de préparation indéfiniment en attente.
5. Les providers sans métadonnées de préparation se comportent exactement comme avant.

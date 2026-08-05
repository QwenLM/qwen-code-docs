# Annotations d'entrée des messages utilisateur du WebShell

## Contexte

La capacité `@` du WebShell prend déjà en charge le rendu sous forme de chips, dans la zone de saisie, des fichiers sélectionnés, des extensions, des ressources MCP et des éléments de provider personnalisés du host. Les chips dans la zone de saisie proviennent des inline widgets de CodeMirror ; le widget porte le `WebShellComposerTag` complet, ce qui permet d'obtenir de manière fiable `id`, `kind`, `label`, `value`, `serialized`, `removable`, ainsi que l'icône injectée par le host via `composerTagIcons`.

La première implémentation du PR1 actuel ne modifiait pas la chaîne d'envoi : elle re-parsait simplement les références `@...` à partir du texte de `content` au stade du rendu du message utilisateur, puis rendait sous forme de chips les références built-in reconnues. Cela couvrait certains scénarios réversibles, par exemple `@.qwen/`, `@ext:name`, `@mcp:name`, mais cela reposait sur des suppositions textuelles et ne pouvait pas couvrir toutes les entrées réelles.

Les retours de review ont mis en évidence le problème fondamental de cette approche :

- `@Makefile`, `@LICENSE`, `@src/Makefile` sont des références de fichiers valides, mais le texte seul ne permet pas de les distinguer de manière fiable d'une mention ordinaire ou d'un token de type package.
- Les références de provider personnalisé comme `@dataset:users` ne laissent que du texte après l'envoi ; le rendu par défaut ne peut pas récupérer les `kind`, `label`, `value` et icône d'origine.
- La frontière entre une ressource MCP échappée et la ponctuation qui la suit ne peut être traitée que par heuristique ; continuer à ajouter des règles rendrait le parser de plus en plus complexe, sans pouvoir prouver une correction complète.

Le PR1 doit donc élargir son périmètre : sans modifier le texte du prompt reçu par le modèle, conserver les métadonnées d'entrée structurées que le composer possède déjà le long des chaînes de soumission, de transcription, de message local et de relecture. Le rendu du message utilisateur n'utilise que les métadonnées pour rendre les chips ; les anciens messages ou les messages sans métadonnées restent affichés en texte brut, sans plus tenter de deviner les références à partir du texte seul.

Le nouveau champ ne doit pas être nommé `composerTags`. `composerTag` est un détail d'implémentation du chip `@` actuel, mais les entrées utilisateur du WebShell comprennent aussi des slash commands `/`, des commandes de skill, des commandes personnalisées, des commandes système, des commandes locales et autres entrées structurées. Les nouvelles métadonnées d'envoi doivent exprimer « les annotations structurées de l'entrée utilisateur » ; cette itération n'écrit que les annotations de références `@`, et pourra ensuite ajouter dans le même champ les annotations de commandes `/`.

## Objectifs

- Les chips de références `@` que l'utilisateur voit dans la zone de saisie conservent un rendu de chip cohérent dans la bulle du message utilisateur après l'envoi.
- Prendre en charge les tags built-in de fichier, d'extension et de MCP, y compris les fichiers sans extension et les ressources MCP échappées.
- Prendre en charge le rendu de chip par défaut des providers personnalisés du host, tant que le provider fournit un `composerTag` dans l'élément accepté.
- Ne pas modifier le contenu du prompt côté modèle ; le démon/modèle reçoit toujours la chaîne produite par `buildComposerPrompt(text, tags)`.
- Préserver la capacité de surcharge de `renderUserMessageContent` ; si le host a personnalisé le contenu du message utilisateur, il peut toujours prendre entièrement en charge le rendu.
- Rester compatible avec les anciennes transcriptions, les anciens démons et les messages sans métadonnées : le contenu reste affiché tel quel, sans rendu de chip supplémentaire.
- Réserver un point d'extension unifié pour les entrées structurées ultérieures telles que les commandes `/`, les commandes de skill et les commandes personnalisées.

## Non-objectifs

- Ne pas modifier le protocole d'enregistrement des providers `@`.
- Ne pas ajouter de prise en charge `@skill:` pour les skills ; le WebShell référence actuellement les skills via `/`.
- Ne pas écrire les URL d'icônes dans la transcription persistée. Les icônes continuent d'être résolues par `composerTagIcons` selon le `kind` au moment du rendu.
- Ne pas transmettre les métadonnées au modèle, ni modifier la sémantique de parsing du prompt du démon.
- Ne pas tenter de restaurer à 100 % depuis le texte brut toutes les références de provider personnalisé ou de fichiers sans extension.
- Ne pas modifier le rendu des commandes `/` dans cette itération ; concevoir uniquement le champ de métadonnées pour qu'il puisse porter des annotations de commandes `/`.
- Ne pas compléter dans cette itération la reconstruction des annotations pour le retry Ctrl+Y ; le retry réutilise le message utilisateur d'origine et n'ajoute pas d'echo utilisateur dupliqué.
- Ne pas compléter dans cette itération la restauration des annotations après un échec de `onSubmitBefore` ; en cas d'échec, le prompt n'entre pas dans la chaîne d'envoi et le comportement d'annulation actuel est conservé.

## Décisions de périmètre

- Cette itération accepte de modifier simultanément `packages/web-shell`, `packages/webui`, `packages/sdk-typescript` et `packages/acp-bridge`. Les trois premiers prennent en charge la soumission, l'echo local, les types transcript/message et le rendu ; `packages/acp-bridge` est chargé d'écrire l'echo utilisateur du démon dans `user_message_chunk.update._meta` rejouable, sinon l'annotation ne pourrait pas être restaurée après actualisation/réouverture de la session.
- L'envoi ordinaire et les prompts mis en file d'attente doivent tous deux prendre en charge l'annotation. Les prompts en file d'attente affichent aussi cette saisie dans la zone des messages utilisateur ; sans métadonnées, ils seraient incohérents avec l'envoi ordinaire.
- `renderUserMessageContent` doit voir ses paramètres étendus, afin que le renderer personnalisé du host puisse lire `inputAnnotations`. Le renderer par défaut utilise les métadonnées pour rendre les chips ; le renderer du host conserve la priorité finale.
- Supprimer le fallback qui déduit les chips `@` à partir du texte brut, pour éviter de continuer à maintenir un parser heuristique qui ne peut pas être complètement correct.
- Cette itération ne produit et ne rend que les annotations de références `@` ; les commandes `/`, les commandes de skill et les commandes personnalisées sont uniquement réservées dans la structure de données, sans rendu de chip après envoi.

## Capacités d'entrée structurées recensées

Le côté entrée du WebShell actuel dispose au moins des capacités structurées suivantes :

- Références `@` : fournies par `useAtMentionMenu`, comprenant les fichiers built-in, les extensions, les serveurs/ressources MCP, ainsi que les providers personnalisés injectés par le host via `atProviders`. Une fois acceptées, elles génèrent un `WebShellComposerTag` et le chip est rendu par un inline widget de CodeMirror.
- Slash commands `/` : la complétion est fournie par `slashCompletion.ts`. Les commandes de premier niveau proviennent de `session.available_commands` du démon, des commandes locales du WebShell, des commandes personnalisées, des commandes de skill et des commandes système.
- Sous-commandes `/` : `slashCompletion.ts` prend en charge les `subcommands` explicites, l'arbre de sous-commandes intégré et l'arbre de sous-commandes implicite. Par exemple `/mcp desc`, `/stats model`, `/memory show`, `/skills <skill-name>`.
- Catégories de commandes : `commandDisplay.ts` répartit les commandes entre `custom`, `skill` et `system`. `App.tsx` marque la commande correspondante dans la catégorie skill selon `connection.skills`.
- Slash commands locaux : `localCommands.ts` définit les commandes locales `help`, `theme`, `language`, `model`, `mcp`, `skills`, `memory`, `context`, `agents`, `goal`, `tasks`, `extensions`, etc.
- Mode shell / `!` : le composer peut soumettre en mode shell avec `!${prompt}` ; c'est une autre sémantique d'entrée utilisateur, mais elle n'entre pas dans le périmètre de rendu de cette itération.

Ces capacités montrent que le nouveau champ de métadonnées doit être une liste d'annotations générique, et non une liste de tags dédiée uniquement à `@`.

## Chaîne actuelle

### Dans la zone de saisie

`useComposerCore` maintient des tags inline dans la zone de saisie. Au moment de la soumission, il est déjà possible d'obtenir le `WebShellComposerTag[]` complet via `tagsOverride ?? composerTagsRef.current`. Ces tags servent à `buildComposerPrompt(text, tags)` et sont finalement fusionnés dans le texte du prompt envoyé au démon.

### Envoi et echo local

`sendPrompt` dans `App.tsx` ne reçoit que `text` et `images`, et `sessionActions.sendPrompt(text, options)` n'envoie que le texte du prompt. Pour l'affichage optimiste ou l'echo des commandes locales, le WebShell appelle `store.appendLocalUserMessage(text, images)`.

`appendLocalUserMessage` n'écrit actuellement que `text/images` dans le `DaemonTextTranscriptBlock`, sans métadonnées d'entrée structurées.

### Relecture vers les composants de message

`transcriptBlocksToDaemonMessages` convertit les blocs user de la transcription en `DaemonUserMessage`, en ne conservant actuellement que `content`, `images`, `timestamp` et `source`. `UserMessage` ne peut obtenir que `content/images`, c'est pourquoi la première implémentation ne pouvait que deviner à nouveau les tags via un parser de texte.

## Vue d'ensemble de la solution

Ajouter une chaîne de métadonnées uniquement UI. Elle se divise en deux chemins adjacents mais aux responsabilités distinctes : l'echo optimiste de la page courante, et l'echo persisté de la transcription du démon.

```text
CodeMirror inline tags
  -> submitText / submitPromptFromEditor
  -> sendPrompt options
  -> sessionActions.sendPrompt / sessionActions.submitPrompt options
  -> A. store.appendLocalUserMessage(text, images, { inputAnnotations })
     -> affichage immédiat des chips du message utilisateur dans l'onglet courant
  -> B. PromptRequest._meta.inputAnnotations
     -> bridge echoPromptToSessionBus fusionne dans user_message_chunk.update._meta
     -> replay/load obtient le même lot d'événements session_update
     -> normalizeDaemonEvent génère user.text.delta.meta.inputAnnotations
     -> reduceDaemonTranscriptEvents écrit dans DaemonTextTranscriptBlock.meta.inputAnnotations
     -> transcriptBlocksToDaemonMessages
     -> DaemonUserMessage.inputAnnotations
     -> renderer par défaut de UserMessage
```

`content` reste le texte du prompt que le modèle et le démon doivent traiter. `inputAnnotations` ne décrit que les entrées structurées nécessaires au rendu UI et ne participe pas à l'entrée du modèle.

## Structure de données

Ajouter une structure générique d'annotation d'entrée ; le champ de premier niveau est nommé `inputAnnotations` :

```ts
interface DaemonUserMessage {
  id: string;
  role: 'user';
  content: string;
  images?: Array<{ data: string; mimeType: string }>;
  source?: string;
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`DaemonInputAnnotation` exprime « la sémantique structurée correspondant à un segment de texte dans content ». Le principe de conception est d'ajouter uniquement un wrapper d'annotation externe, en réutilisant autant que possible les formats d'objets existants de `@` et `/` pour le payload interne, afin d'éviter un nouveau protocole parallèle à `WebShellComposerTag` et `CommandInfo`. Cette itération ne met en place que `type: 'reference'` ; les commandes `/` pourront ensuite réutiliser le même tableau pour continuer à étendre :

```ts
interface DaemonInputReferenceAnnotation {
  type: 'reference';
  start: number;
  end: number;
  text: string;
  reference: DaemonInputReference;
}

interface DaemonInputReference {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}

type DaemonInputAnnotation = DaemonInputReferenceAnnotation;
```

`start/end` sont des offsets UTF-16 relatifs au `content` final, cohérents avec le traitement actuel des chaînes par React/CodeMirror. Cela évite que le rendu ultérieur doive retrouver la position dans `content` à partir de `serialized`, et laisse de la marge pour la coexistence de plusieurs références identiques, de commandes identiques et de texte inline.

Dans cette itération, le payload des références `@` réutilise directement le `WebShellComposerTag` existant :

```ts
interface WebShellComposerTag {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}
```

À l'avenir, le payload des commandes `/` réutilisera directement le `CommandInfo` existant, en ajoutant simplement `subcommandPath` au niveau de l'annotation :

```ts
interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
  subcommands?: string[];
  source?: string;
  displayCategory?: 'custom' | 'skill' | 'system';
}
```

Stocker les mêmes `inputAnnotations` dans le `meta` du bloc de transcription du SDK :

```ts
interface DaemonTextDeltaMeta {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

Lors de l'implémentation, le package SDK ne doit pas importer les types du client WebShell. Le SDK définit une structure meta minimale compatible avec les champs de `WebShellComposerTag` et `CommandInfo`, puis l'adaptateur WebShell convertit cette structure vers les types nécessaires au rendu du client. Cela évite une dépendance inverse du SDK vers le WebShell, tout en gardant une forme de champs cohérente avec les formats `@` / `/` existants.

## Points de modification clés

### 1. La chaîne de soumission porte inputAnnotations

Ajuster la forme des paramètres de la soumission de l'éditeur, afin que `sendPrompt` puisse obtenir le `DaemonInputAnnotation[]` au moment de la soumission.

Il est suggéré d'ajouter un champ d'options léger :

```ts
interface SendPromptInputMetadata {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`useComposerCore.submitText()` connaît déjà les `tags` et le `prompt` final lorsqu'il génère le texte du prompt. Il doit convertir les tags `@` de cette itération en annotations `reference`, puis appeler l'`onSubmit` de niveau supérieur :

- `promptText` : le texte envoyé actuellement au démon, inchangé.
- `images` : les images courantes.
- `inputAnnotations` : l'instantané des annotations d'entrée structurées au moment de la soumission.

Si la signature actuelle de `onSubmit` ne se prête pas à une extension directe, un quatrième paramètre de métadonnées peut être ajouté, pour éviter de casser les appels existants :

```ts
onSubmit(promptText, images, commitAccepted, { inputAnnotations });
```

Règles de génération des annotations dans cette itération :

- Calculer `start/end` pour les préfixes de tags générés par `buildComposerPrompt(text, tags)`.
- Chaque tag correspond à une annotation `type: 'reference'`.
- `annotation.text` utilise le texte serialized réel dans le prompt final.
- `annotation.reference` conserve les champs sûrs minimaux de l'ancien `WebShellComposerTag` : `id/kind/label/value/serialized/removable`.
- Ne pas conserver l'URL de l'icône ; l'icône reste résolue par `kind + composerTagIcons` au moment du rendu.

Si les commandes `/` ont aussi besoin d'un rendu structuré à l'avenir, une annotation `type: 'command'` peut être générée lors de l'acceptation dans la complétion slash, ou générée au stade de la soumission à partir du `CommandInfo` correspondant. Le payload de commande conserve directement les champs du `CommandInfo` existant, et les informations de sous-commande sont placées dans le `subcommandPath` du wrapper d'annotation.

### 2. L'echo de la transcription locale conserve les métadonnées

Étendre le store de transcription du SDK :

```ts
appendLocalUserMessage(
  text: string,
  images?: Array<{ data: string; mimeType: string }>,
  meta?: { inputAnnotations?: DaemonInputAnnotation[] },
): void;
```

`appendLocalUserTranscriptMessage` reçoit `meta` de manière synchrone :

```ts
appendLocalUserTranscriptMessage(state, text, { images, meta });
```

Écrire après la création du bloc text user :

```ts
if (opts.meta) {
  block.meta = { ...block.meta, ...opts.meta };
}
```

Cette chaîne garantit uniquement que le message utilisateur optimiste dans le store frontend courant porte immédiatement les chips. Elle ne garantit pas à elle seule que les métadonnées restent disponibles après actualisation ou réouverture de la session, car la transcription après actualisation provient de la relecture du démon, et non de l'ajout local en mémoire de l'onglet courant.

Les commandes slash locales sans annotation d'entrée continuent de transmettre des métadonnées vides, sans modifier le comportement existant.

### 3. L'echo du prompt du démon persiste les métadonnées

`PromptRequest` prend déjà en charge `_meta?: Record<string, unknown> | null`. Lors de l'envoi, écrire le même `inputAnnotations` dans `PromptRequest._meta.inputAnnotations` :

```ts
const promptRequest = {
  prompt: toDaemonPromptContent(text, normalizedImages),
  _meta: inputAnnotations.length > 0 ? { inputAnnotations } : undefined,
};
```

Dans `sendPrompt`, le bridge confie la requête au prompt de l'agent et publie en même temps `user_message_chunk` via `echoPromptToSessionBus`. Il faut ici fusionner `_meta.inputAnnotations` de la requête dans l'`update._meta` de l'echo :

```ts
_meta: {
  ...pickUserInputEchoMeta(req._meta),
  serverTimestamp,
  source: 'bridge-echo',
}
```

`pickUserInputEchoMeta` ne conserve que `inputAnnotations` et n'écrit pas les métadonnées de requête inconnues telles quelles dans la transcription du message utilisateur. Cela évite d'exposer à `UserMessage` des données non UI comme la télémétrie, requestId ou retry.

Lors de la relecture, `DaemonSessionProvider` re-normalise `compactedReplay/liveJournal` en événements UI ; `normalizeDaemonEvent` place déjà `user_message_chunk.update._meta` dans `user.text.delta.meta` ; le reducer de transcription écrit déjà le `meta` des événements text dans `DaemonTextTranscriptBlock.meta`. Il suffit donc que l'événement d'echo du démon porte `inputAnnotations` pour que le rendu des chips soit restauré après actualisation et réouverture de la même session.

### 4. L'adaptateur de transcription relaie les métadonnées

`transcriptBlocksToDaemonMessages` lit déjà le `meta.source` des blocs user. Au même endroit, lire `meta.inputAnnotations`, le valider en tant que tableau puis l'écrire dans `DaemonUserMessage.inputAnnotations`.

Une validation structurelle minimale est nécessaire ici, pour éviter que des méta inconnues de la transcription n'affectent le rendu :

- Ce doit être un tableau.
- Chaque annotation doit avoir un `id/type/text` string non vide.
- `start` et `end` doivent être des nombres finis, avec `0 <= start < end <= content.length`.
- Cette itération ne produit et ne rend que des annotations `type: 'reference'` ; les annotations de commande pourront être étendues sous le même champ par la suite.
- Le payload de référence est assaini minimalement selon les champs de `WebShellComposerTag`, en n'acceptant que des valeurs string pour `id/kind/label/value/serialized` et une valeur boolean pour `removable`.
- Le payload de commande est assaini minimalement selon les champs de `CommandInfo`, en n'acceptant que des valeurs string pour `name/description/argumentHint/source/displayCategory` et un tableau de strings pour `subcommands`.
- Ne pas conserver les champs inconnus.

### 5. UserMessage utilise inputAnnotations en priorité

Ajouter aux props de `UserMessage` :

```ts
inputAnnotations?: DaemonInputAnnotation[];
```

Les paramètres de `renderUserMessageContent` reçoivent simultanément un champ de même nom :

```ts
renderUserMessageContent?.({ content, images, inputAnnotations });
```

La logique de rendu par défaut devient :

1. Si `inputAnnotations` contient une annotation `type: 'reference'` valide, découper `content` selon `start/end` et rendre les chips.
2. Si les métadonnées sont absentes ou sans annotation valide, rendre le texte brut.
3. Si le host fournit `renderUserMessageContent`, continuer d'utiliser le renderer du host en priorité.

Le rendu par métadonnées ne devine plus le type de tag à partir de `content` et n'a plus besoin de chercher la position selon le texte serialized. Lorsque les ranges sont invalides ou se chevauchent, les annotations correspondantes sont ignorées, en garantissant qu'aucun contenu utilisateur ne soit masqué.

### 6. Suppression du fallback de parser de texte

`splitComposerTagContent` n'est pas conservé. La raison est que l'ancien parser ne pouvait que deviner le type de référence à partir de la forme de la chaîne :

- `@Makefile` et `@alice` peuvent tous deux être du texte valide.
- `@dataset:users` nécessite les métadonnées du provider pour connaître label/value/icône.
- La ponctuation finale des ressources MCP échappées est difficile à prouver correcte par des règles générales.

Le message utilisateur par défaut ne rend donc des chips que lorsqu'une annotation existe ; en l'absence d'annotation, il affiche le texte brut. Le problème `@Makefile` de la review ne dépend ainsi plus d'une heuristique, car les nouveaux messages obtiennent un tag de fichier explicite depuis les métadonnées.

## Comportement des providers personnalisés

Si le provider fournit dans l'élément accepté :

```ts
composerTag: {
  id: 'dataset:users',
  kind: 'dataset',
  label: 'Dataset',
  value: 'users',
  serialized: '@dataset:users',
}
```

Après l'envoi, le message utilisateur par défaut peut rendre :

- label : `Dataset`
- value : `users`
- icône : résolue via `composerTagIcons.dataset`

Si le provider ne fournit pas `composerTag`, il n'y aura après l'envoi que du texte brut ; le renderer par défaut ne promet pas de reconnaître automatiquement les providers personnalisés. Le host peut toujours utiliser `renderUserMessageContent` pour les traiter lui-même.

## Compatibilité

- Les anciennes transcriptions n'ont pas de `meta.inputAnnotations` et continuent d'être affichées en texte brut.
- Un nouveau client lisant les événements d'un ancien démon ne présente aucun changement de comportement.
- Un ancien client lisant une transcription avec `meta.inputAnnotations` ignore les méta inconnues.
- `content` ne change pas, donc le parsing du prompt du démon, l'entrée du modèle, le texte des slash commands et le contenu des prompts historiques ne sont pas affectés.
- La priorité de `renderUserMessageContent` ne change pas ; le rendu personnalisé du host n'est pas écrasé par les chips par défaut.

## Plan de test

### Tests unitaires

- `appendLocalUserTranscriptMessage` conserve `meta.inputAnnotations`.
- `createDaemonTranscriptStore().appendLocalUserMessage` peut recevoir et conserver les métadonnées.
- `sessionActions.sendPrompt` et `sessionActions.submitPrompt` peuvent écrire `inputAnnotations` dans `PromptRequest._meta`.
- `echoPromptToSessionBus` du bridge ne fusionne que `inputAnnotations` dans `user_message_chunk.update._meta`, sans écrire de méta de requête inconnues dans l'echo de la transcription.
- Les `user_message_chunk.update._meta.inputAnnotations` de la relecture peuvent être écrits dans `DaemonTextTranscriptBlock.meta.inputAnnotations` via `normalizeDaemonEvent` et le reducer.
- `transcriptBlocksToDaemonMessages` convertit les `meta.inputAnnotations` des blocs user en `DaemonUserMessage.inputAnnotations`.
- `transcriptBlocksToDaemonMessages` filtre les méta d'annotation invalides.
- `UserMessage` utilise les annotations de référence pour rendre `@Makefile`, `@LICENSE`, `@src/Makefile`.
- `UserMessage` utilise les annotations de référence pour rendre les tags de provider personnalisé et résout `composerTagIcons`.
- `UserMessage` conserve l'affichage en texte brut lorsque les métadonnées sont absentes.
- `UserMessage` ignore une annotation lorsque son range est invalide ou chevauchant, sans perdre le texte d'origine.
- Le type d'annotation de commande réservé peut être conservé par la validation de schéma, mais le rendu par défaut de cette itération l'ignore et n'affecte pas le rendu des références.

### Intégration / vérification navigateur

- Dans un WebShell local, sélectionner `.qwen/`, `Makefile` ou `LICENSE` ; après l'envoi, le message utilisateur affiche toujours le chip de fichier.
- Sélectionner une ressource MCP ; après l'envoi, le message utilisateur affiche le chip MCP et les caractères échappés de la ressource ne sont pas rognés à tort.
- Injecter un provider personnalisé, le sélectionner puis envoyer ; le message utilisateur affiche label/value/icône personnalisés.
- Actualiser la page ou rouvrir la même session ; les chips du message utilisateur sont toujours présents.

## Risques et contrôles

- Risque : l'augmentation des types inter-packages élargit la surface du PR. Contrôle : définir dans le SDK un `DaemonInputAnnotation` minimal, pour éviter que le SDK n'importe les types du client WebShell.
- Risque : une incohérence entre les métadonnées et `content` provoque un décalage de rendu. Contrôle : UserMessage n'utilise que des ranges valides et non chevauchants ; les annotations invalides sont ignorées directement, sans masquer aucun contenu utilisateur.
- Risque : la persistance des informations de provider personnalisé peut contenir des champs personnalisés du host. Contrôle : ne conserver que `id/kind/label/value/serialized/removable`, sans conserver les champs inconnus ni les URL d'icônes.
- Risque : le coût de review augmente après l'élargissement du périmètre du PR1. Contrôle : le message de soumission précise la motivation : il s'agit de résoudre la cause racine — le parser en texte brut ne peut pas restaurer correctement l'identité des fichiers/custom/MCP — tout en conservant le prompt destiné au modèle inchangé.
- Risque : un nommage trop restrictif des métadonnées de premier niveau limiterait les capacités `/` ultérieures. Contrôle : utiliser `inputAnnotations` comme point d'entrée unifié, cette itération n'écrivant que `type: 'reference'`.

## Ordre d'implémentation

1. Ajouter la structure minimale de la méta d'annotation d'entrée dans les types de transcription du SDK.
2. Étendre `appendLocalUserTranscriptMessage` et `DaemonTranscriptStore.appendLocalUserMessage`.
3. Étendre les options de soumission du WebShell, en transmettant `inputAnnotations` depuis `useComposerCore` jusqu'à `App.sendPrompt` et la soumission des prompts en file d'attente.
4. Lors de l'écriture de l'echo optimiste dans `store.appendLocalUserMessage`, porter `inputAnnotations`.
5. Écrire `inputAnnotations` dans `PromptRequest._meta` du démon, et faire en sorte que l'echo utilisateur du bridge les fusionne dans `user_message_chunk.update._meta`.
6. Relayer et assainir `meta.inputAnnotations` dans `transcriptBlocksToDaemonMessages`.
7. Étendre la chaîne de props de `DaemonUserMessage`, `MessageList` jusqu'à `UserMessage`.
8. Étendre les paramètres de `renderUserMessageContent` pour exposer `inputAnnotations` au renderer du host.
9. Le rendu par défaut de `UserMessage` n'utilise que les métadonnées ; sans métadonnées, afficher le texte tel quel.
10. Compléter les tests unitaires et les captures d'écran d'acceptation navigateur.

## Points clés de la description du PR

La description du PR doit préciser :

- Il ne s'agit pas de modifier le prompt du modèle, mais de conserver les métadonnées d'annotation d'entrée UI que le WebShell possède déjà.
- Un parser en texte brut ne peut pas distinguer de manière fiable les formes telles que `@Makefile`, `@alice`, `@dataset:users` ; les métadonnées sont donc nécessaires.
- Les anciens messages restent compatibles avec un affichage en texte brut ; les providers personnalisés ne bénéficient du rendu de chip par défaut que s'ils fournissent un `composerTag`.
- Le nouveau champ est nommé `inputAnnotations` ; cette itération ne porte que les références `@`, et il pourra ensuite porter les commandes `/`, les commandes de skill, les commandes personnalisées et autres entrées structurées.
- `renderUserMessageContent` reste le point de surcharge final du host.

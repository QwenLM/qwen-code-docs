# Compression des images lors de la compaction + Correction de l'estimation des tokens

## Problème

Lorsque `ChatCompressionService` se déclenche (automatiquement ou manuellement), il envoie
`historyToCompress` tel quel au modèle de résumé. Deux problèmes connexes
dégradent la qualité, la précision et le coût :

1. **Fuites d'images/documents en ligne dans le prompt de résumé.**
   Les outils MCP qui exposent des pièces jointes (captures d'écran,
   maquettes, PDFs) placent des parties `inlineData` directement dans la
   conversation. Le pipeline de compression ne les supprime pas, donc le
   modèle de résumé reçoit du base64 brut qu'il ne peut généralement pas
   interpréter, et la charge utile de la requête secondaire est inutilement
   gonflée.

2. **L'estimation des tokens de `findCompressSplitPoint` est erronée pour les
   parties binaires.** L'algorithme du point de coupure utilise
   `JSON.stringify(content).length` pour répartir les caractères dans
   l'historique. Une seule image base64 de 1 Mo (~1,4 M de caractères) fait
   qu'une entrée ressemble à ~350 K tokens, écrasant le texte réel et
   biaisant la coupure vers le mauvais endroit. Le coût réel en tokens pour
   une image Qwen-VL est au maximum de quelques milliers de tokens.
   L'estimateur devrait traiter les parties binaires comme une petite
   constante.

claude-code traite (1) avec `stripImagesFromMessages`. qwen-code n'a
ni cette suppression ni la correction correspondante du comptage de caractères.

Cette modification ajoute les deux, limitée **uniquement à l'entrée de la
requête secondaire de compaction**. L'historique de conversation en direct,
la persistance (`chats/<sessionId>.jsonl`) et le prompt envoyé au modèle
principal au tour suivant ne sont pas touchés. La réduction s'applique
uniquement à la charge utile de la requête secondaire construite dans
`chatCompressionService`.

### Hors périmètre (reporté ou rejeté)

- **Externalisation des gros collages vers un cache de collage.** Une
  version préliminaire de cette conception proposait de hacher le texte
  surdimensionné dans `~/.qwen/paste-cache/<sha>.txt` et de le remplacer
  par un espace réservé. Nous l'avons rejetée après avoir examiné les
  versions de claude-code de 2026-03 à 2026-05 : la direction en amont
  est de garder les entrées utilisateur visibles pour le modèle et
  d'amortir le coût via la mise en cache du prompt (boutons TTL de 1h,
  réduction d'image) plutôt que de les externaliser. Mettre les entrées
  utilisateur textuelles derrière un espace réservé haché risque une
  « dérive d'intention » une fois que la compaction a fait disparaître le
  texte original. Si nous revenons sur ce point plus tard, le bon motif
  est `read_paste(hash)` en tant qu'outil réel que le modèle peut
  utiliser, et non une réécriture silencieuse.

## État actuel vs Cible

| Problème                          | qwen-code aujourd'hui                              | Référence claude-code                                      | Cible après ce changement                                      |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Image/document dans le prompt compact | Envoyé tel quel                                   | `stripImagesFromMessages` remplace par `[image]` / `[document]` | Envoyé comme espace réservé `[image: mime]` / `[document: mime]` |
| Estimation des tokens partie binaire | `JSON.stringify().length` (complètement faux)      | Traité comme un budget fixe                                  | Constante configurable (par défaut 1 600 tokens / ~6 400 caractères) |
| Nettoyage des images en microcompact | Non touché (seuls les résultats d'outils textuels effacés en inactivité) | MC basé sur le temps efface tout                             | Le microcompact efface également les images en ligne obsolètes en même temps que les résultats d'outils |

## Modifications proposées

### Couche 1 : Réduction de l'entrée de compaction (`services/compactionInputSlimming.ts`)

Un nouveau module pur qui prend `Content[]` et renvoie un
`Content[]` réduit. Une transformation : suppression des médias en ligne.
Parcourez chaque `Part`. Si la partie a `inlineData` ou `fileData`,
remplacez-la par une partie `text` de la forme `[image: image/png]`
(ou `[document: application/pdf]`).

qwen-code attache les médias retournés par les outils sur
`functionResponse.parts` (une extension du schéma `FunctionResponse`
standard de `@google/genai` ; voir
`coreToolScheduler.createFunctionResponsePart`). Le
réducteur parcourt récursivement ce tableau imbriqué afin qu'une image
base64 retournée par `read_file` ou tout outil MCP émettant des pièces
jointes soit également remplacée.

La transformation renvoie un nouveau tableau `Content[]` ; l'original n'est
jamais muté. Si la transformation ne produit aucun changement, la référence
du tableau original est retournée (identité égale). L'orchestrateur appelle
`slimCompactionInput` comme dernière étape avant `runSideQuery` dans
`chatCompressionService.ts`.

### Couche 2 : Correction de l'estimation des tokens (`chatCompressionService.ts`)

`findCompressSplitPoint` utilise actuellement `JSON.stringify(content).length`
pour la répartition des caractères. Remplacez-le par un
helper `estimateContentChars` qui :

- Pour les parties `text` : `text.length`
- Pour les parties `inlineData` / `fileData` : `imageTokenEstimate * 4` (par défaut
  1 600 × 4 = 6 400 caractères).
- Pour les parties `functionCall` / `functionResponse` :
  `JSON.stringify(part).length` (comportement inchangé).

C'est la même constante que le module de réduction utilise, donc le budget
que voit l'algorithme du point de coupure correspond à ce que le prompt
réduit consomme réellement en aval. Pour éviter les parcours en double,
`compress()` précalcule `charCounts` une fois et les transmet à
`findCompressSplitPoint` (nouvel argument optionnel n°4) ; le même tableau
est réutilisé pour la garde `MIN_COMPRESSION_FRACTION`.

### Couche 3 : Nettoyage des images en microcompact (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` renvoie désormais trois groupes :

- `tool` — parties `functionResponse` d'outils intégrés compactables.
  Effacé comme une unité : la sortie de réponse remplacée par le sentinel,
  `functionResponse.parts` supprimé avec elle.
- `media` — parties `inlineData` / `fileData` de premier niveau sous les
  messages de rôle utilisateur (par exemple, images collées via `@reference`).
  Remplacé par `[Média en ligne ancien effacé : <mime>]`.
- `nested-media` — parties `functionResponse` d'outils **non compactables**
  (par exemple, outils de capture d'écran MCP dont les noms ne sont pas dans
  `COMPACTABLE_TOOLS`) qui portent des images/documents sur le champ
  d'extension `functionResponse.parts`. Seul le média imbriqué est
  supprimé ; la sortie texte de l'outil est conservée.

Chaque type a son propre budget `keepRecent`. Définir
`toolResultsNumToKeep: 1` conserve le plus récent de chaque catégorie
(1 outil + 1 média + 1 média imbriqué), et non 1 entrée au total dans la
liste combinée.

Les valeurs mimeType provenant des serveurs d'outils MCP sont transmises
via `sanitizeMimeForPlaceholder` avant d'être intégrées dans toute chaîne
d'espace réservé. Le réducteur et le microcompact partagent ce helper.

### Couche 4 : Configuration (`config/config.ts`)

Un nouveau champ sous les paramètres `chatCompression` :

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

Plus un remplacement par variable d'environnement pour les opérations/débogage : `QWEN_IMAGE_TOKEN_ESTIMATE`.

## Décisions de conception clés

**Décision 1 : `imageTokenEstimate = 1600`.**
La famille Qwen-VL plafonne à 1 280 tokens visuels par image sans
`vl_high_resolution_images` ; avec ce drapeau, jusqu'à 16 384. 1 600 est un
terrain d'entente conservateur légèrement surestimé — surestimer conduit à une
compaction plus précoce (sûr), sous-estimer conduit à une compaction tardive
(risqué). Pour les modèles non-VL (Qwen3-Coder, le qwen-code par défaut), la
constante n'a d'importance que pour l'exactitude de l'estimation des tokens,
puisque les images n'atteignent de toute façon pas le modèle.

**Décision 2 : Réduire la copie réduite, pas l'historique en direct.**
`slimCompactionInput` renvoie un nouveau tableau ; l'historique de chat stocké
dans `GeminiChat` n'est pas touché. La persistance locale
(`.chats/<sessionId>.jsonl`) conserve la conversation complète telle que
l'utilisateur l'a vécue, donc `--resume` fonctionne sans perte.

**Décision 3 : Le microcompact traite les images de manière uniforme avec les
anciens résultats d'outils.** Le déclencheur temporel d'inactivité efface déjà
les sorties d'outils obsolètes ; l'étendre aux images en ligne rend la
politique cohérente et réutilise la fenêtre keepRecent existante.

**Décision 4 : Pas de stockage de collage / pas d'externalisation de texte.**
Voir la section Hors périmètre. Le consensus amont (claude-code 2026-03 →
2026-05) est de garder les entrées utilisateur textuelles visibles et
d'amortir via la mise en cache du prompt, pas d'externaliser.

## Fichiers affectés

**Nouveaux fichiers**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Fichiers modifiés**

- `packages/core/src/config/config.ts` — étend `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — appelle la réduction
  avant `runSideQuery` ; remplace le helper de comptage de caractères ;
  précalcule charCounts une fois pour le séparateur + la garde
- `packages/core/src/services/chatCompressionService.test.ts` — ajoute un
  test de câblage vérifiant que le base64 n'atteint jamais le modèle de résumé
- `packages/core/src/services/microcompaction/microcompact.ts` — étend la
  collection aux images en ligne
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  teste l'effacement des images

## Limites du périmètre

**Dans le périmètre**

- Supprimer les médias en ligne de l'entrée de compaction
- Corriger l'estimation des caractères de `findCompressSplitPoint`
- Nettoyage des parties d'images en microcompact sur le déclencheur d'inactivité
- Un paramètre + un remplacement par variable d'environnement

**Reporté**

- Externalisation des gros collages (voir Hors périmètre ci-dessus)
- Outil de réintégration (`read_paste(hash)` etc.)
- Déduplication au niveau de la persistance
- Décomposition des collages dans `/context`
- Événements de télémétrie pour les statistiques de réduction

## Questions ouvertes

1. **Le texte de l'espace réservé doit-il inclure un hachage pour permettre une
   réintégration future ?** Aujourd'hui nous émettons simplement `[image: image/png]`. Si/quand un outil de type `read_paste` apparaît, nous pourrions
   vouloir un identifiant. Pour l'instant, l'espace réservé est informatif ;
   l'image originale existe toujours dans l'historique en direct et la
   persistance.
2. **`imageTokenEstimate = 1600` est-il correct pour les modèles non-Qwen-VL
   servis via des proxys Anthropic / OpenAI ?** Probablement une légère
   sous-estimation pour Claude (où les images peuvent atteindre ~5 K tokens)
   mais sans danger : elle n'affecte que l'heuristique du point de coupure,
   jamais le prompt réel que voit le modèle utilisateur.
3. **La garde `MIN_COMPRESSION_FRACTION` est calculée sur les comptages de
   caractères pré-réduction.** Une tranche riche en images peut franchir le
   seuil de 5 % (car les images comptent pour ~6 400 caractères chacune dans
   l'estimateur) puis rétrécir en espaces réservés `[image: …]` post-réduction.
   Le modèle de résumé reçoit alors presque aucun contexte textuel. C'est
   intentionnel pour l'instant : le travail du résumé est d'enregistrer
   « l'utilisateur a partagé une image de X » même lorsque la majeure partie
   de la tranche était visuelle, et le but de la garde est « y a-t-il assez
   de contenu pour mériter un résumé » — ce que les images satisfont
   raisonnablement. Si la qualité régresse, nous pourrons y revenir soit en
   revérifiant après réduction, soit en biaisant la garde sur la proportion
   d'`imagesStripped`.
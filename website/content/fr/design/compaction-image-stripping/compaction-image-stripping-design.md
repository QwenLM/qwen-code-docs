# Suppression des images dans la compaction + Correction de l'estimation des tokens

## Énoncé du problème

Quand `ChatCompressionService` se déclenche (automatiquement ou manuellement), il envoie
`historyToCompress` textuellement au modèle de résumé. Deux problèmes connexes
dégradent la qualité, la précision et le coût :

1. **Les données binaires d'images/documents se retrouvent dans le prompt de résumé.**
   Les outils MCP qui exposent des pièces jointes (captures d'écran, maquettes,
   PDF) placent des parties `inlineData` directement dans la conversation.
   Le pipeline de compaction ne les supprime pas, donc le modèle de résumé
   reçoit du base64 brut qu'il ne peut généralement pas interpréter, et la
   charge utile de la requête annexe est inutilement gonflée.

2. **L'estimation des tokens dans `findCompressSplitPoint` est erronée pour les
   parties binaires.** L'algorithme du point de coupure utilise
   `JSON.stringify(content).length` pour répartir les caractères dans
   l'historique. Une seule image base64 de 1 Mo (~1,4 M de caractères) fait
   qu'une entrée semble contenir ~350 000 tokens, éclipsant le texte réel et
   déplaçant la coupure vers un mauvais endroit. Le coût réel en tokens pour
   une image Qwen-VL est au maximum de quelques milliers de tokens.
   L'estimateur devrait traiter les parties binaires comme une constante faible.

claude-code résout (1) avec `stripImagesFromMessages`. qwen-code n'a ni
cette suppression ni la correction correspondante du comptage de caractères.

Cette modification ajoute les deux, limitées à **l'entrée de la requête annexe de
compaction uniquement**. L'historique de la conversation en direct, la persistance
(`chats/<sessionId>.jsonl`) et le prompt envoyé au modèle principal lors du
tour suivant ne sont pas touchés. L'allègement s'applique uniquement à la charge
utile de la requête annexe construite dans `chatCompressionService`.

### Hors périmètre (reporté ou rejeté)

- **Externalisation des gros collages vers un cache de collage.** Une première
  ébauche de cette conception proposait de hacher le texte surdimensionné dans
  `~/.qwen/paste-cache/<sha>.txt` et de le remplacer par un espace réservé.
  Nous l'avons rejetée après avoir examiné les versions de claude-code de
  2026-03 à 2026-05 : la direction poursuivie en amont est de garder l'entrée
  utilisateur visible pour le modèle et d'amortir le coût via la mise en cache
  des prompts (réglages de TTL à 1 h, réduction des images) plutôt que de
  l'externaliser. Placer l'entrée utilisateur textuelle derrière un hachage
  comme espace réservé risque de provoquer une « dérive d'intention » une fois
  que la compaction a effacé le texte original. Si nous revenons sur ce point
  plus tard, le bon motif est `read_paste(hash)` comme un véritable outil que
  le modèle peut utiliser, pas une réécriture silencieuse.

## État actuel vs objectif

| Point concerné                        | qwen-code aujourd'hui                               | Référence claude-code                                              | Objectif après cette modification                                           |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Image/document dans le prompt compact | Envoyé textuellement                                | `stripImagesFromMessages` remplace par `[image]` / `[document]`    | Envoyé comme espace réservé `[image: mime]` / `[document: mime]`            |
| Estimation des tokens partie binaire  | `JSON.stringify().length` (très erroné)             | Traité comme un budget fixe                                        | Constante configurable (par défaut 1 600 tokens / ~6 400 caractères)        |
| Nettoyage des images micro-compact    | Non concerné (seul le texte des outils est effacé au repos) | La micro-compaction basée sur le temps efface tout            | La micro-compaction efface aussi les images intégrées obsolètes avec les résultats d'outils |

## Modifications proposées

### Couche 1 : Allègement de l'entrée de compaction (`services/compactionInputSlimming.ts`)

Un nouveau module pur qui prend des `Content[]` et retourne un tableau
`Content[]` allégé. Une seule transformation : suppression des médias
intégrés. Parcourt chaque `Part`. Si la partie a `inlineData` ou
`fileData`, on la remplace par une partie `text` de la forme
`[image: image/png]` (ou `[document: application/pdf]`).

qwen-code attache les médias retournés par un outil sur
`functionResponse.parts` (une extension du schéma standard
`FunctionResponse` de `@google/genai` ; voir
`coreToolScheduler.createFunctionResponsePart`). L'allègeur parcourt
récursivement ce tableau imbriqué afin qu'une image base64 retournée par
`read_file` ou tout outil MCP émettant des pièces jointes soit aussi
remplacée.

La transformation retourne un nouveau tableau `Content[]` ; l'original
n'est jamais muté. Si la transformation ne produit aucun changement, la
référence au tableau original est retournée (égalité par référence).
L'orchestrateur appelle `slimCompactionInput` comme dernière étape avant
`runSideQuery` dans `chatCompressionService.ts`.

### Couche 2 : Correction de l'estimation des tokens (`chatCompressionService.ts`)

`findCompressSplitPoint` utilise actuellement `JSON.stringify(content).length`
pour la répartition des caractères. Remplacez cela par une fonction
`estimateContentChars` qui :

- Pour les parties `text` : `text.length`
- Pour les parties `inlineData` / `fileData` : `imageTokenEstimate * 4` (par
  défaut 1 600 × 4 = 6 400 caractères).
- Pour les parties `functionCall` / `functionResponse` :
  `JSON.stringify(part).length` (comportement inchangé).

C'est la même constante qu'utilise le module d'allègement, de sorte que le
budget que voit l'algorithme du point de coupure correspond à ce que le
prompt allégé consomme réellement en aval. Pour éviter de parcourir deux
fois, `compress()` précalcule `charCounts` une fois et les transmet à
`findCompressSplitPoint` (nouveau 4ème argument optionnel) ; le même
tableau est réutilisé pour la vérification de `MIN_COMPRESSION_FRACTION`.
### Layer 3 : nettoyage des images par microcompact (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` renvoie désormais trois groupes :

- `tool` — parties `functionResponse` des outils intégrés compactables.
  Effacées en une seule unité : la sortie de réponse est remplacée par le sentinel,
  `functionResponse.parts` est supprimé avec elle.
- `media` — parties `inlineData` / `fileData` de premier niveau sous les messages
  de rôle utilisateur (par exemple, images collées via `@reference`). Remplacées par
  `[Ancien média en ligne effacé : <mime>]`.
- `nested-media` — parties `functionResponse` d'outils **non compactables**
  (par exemple, outils de capture d'écran MCP dont les noms ne sont pas dans
  `COMPACTABLE_TOOLS`) qui transportent des images / documents sur le
  champ d'extension `functionResponse.parts`. Seul le média imbriqué est
  supprimé ; la sortie textuelle de l'outil est conservée.

Chaque catégorie a son propre budget `keepRecent`. Définir
`toolResultsNumToKeep: 1` conserve le plus récent de chaque catégorie
(1 outil + 1 média + 1 média imbriqué), et non 1 entrée au total dans toute la
liste combinée.

Les valeurs mimeType provenant des serveurs d'outils MCP sont passées par
`sanitizeMimeForPlaceholder` avant d'être intégrées dans une chaîne de substitution.
Le slimmer et le microcompact partagent cette fonction utilitaire.

### Layer 4 : configuration (`config/config.ts`)

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

## Décisions clés de conception

**Décision 1 : `imageTokenEstimate = 1600`.**
La famille Qwen-VL plafonne à 1 280 jetons visuels par image sans
`vl_high_resolution_images` ; avec ce drapeau, jusqu'à 16 384. 1 600 est un
juste milieu conservateur légèrement élevé — surestimer conduit à un compactage
plus précoce (sûr), sous-estimer conduit à un compactage tardif (dangereux). Pour les modèles non-VL (Qwen3-Coder, le défaut de qwen-code), la constante
n'importe que pour la correction de l'estimation des jetons, puisque les images
n'atteignent de toute façon pas le modèle.

**Décision 2 : Supprimer la copie allégée, pas l'historique en direct.**
`slimCompactionInput` renvoie un nouveau tableau ; l'historique de discussion stocké
dans `GeminiChat` est intact. La persistance locale
(`.chats/<sessionId>.jsonl`) conserve la conversation complète telle que l'utilisateur
l'a vécue, donc `--resume` fonctionne sans perte.

**Décision 3 : Microcompact traite les images uniformément avec les anciens résultats d'outils.**
Le déclencheur temporel inactif efface déjà les sorties d'outils obsolètes ;
l'étendre aux images en ligne maintient la politique cohérente et
réutilise la fenêtre keepRecent existante.

**Décision 4 : Pas de stockage de collage / pas d'externalisation de texte.**
Voir la section Hors périmètre. Le consensus en amont (claude-code 2026-03 →
2026-05) est de conserver la saisie textuelle de l'utilisateur visible et d'amortir via
la mise en cache des invites, sans externalisation.

## Fichiers concernés

**Nouveaux fichiers**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Fichiers modifiés**

- `packages/core/src/config/config.ts` — extension de `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — appel du slimming
  avant `runSideQuery` ; remplacement de l'assistant de comptage de caractères ; précalcul des charCounts
  une fois pour le splitter + la garde
- `packages/core/src/services/chatCompressionService.test.ts` — ajout d'un
  test de câblage vérifiant que le base64 n'atteint jamais le modèle de résumé
- `packages/core/src/services/microcompaction/microcompact.ts` — extension de la collecte
  aux images en ligne
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  test de l'effacement d'images

## Limites du périmètre

**Dans le périmètre**

- Supprimer les médias en ligne de l'entrée de compactage
- Corriger l'estimation de caractères de `findCompressSplitPoint`
- Nettoyage des parties d'images microcompact sur le déclencheur inactif
- Un paramètre + remplacement par variable d'environnement

**Reporté**

- Externalisation des gros collages (voir Hors périmètre ci-dessus)
- Outil de réinflation (`read_paste(hash)` etc.)
- Déduplication de la couche de persistance
- Décomposition `/context` des collages
- Événements de télémétrie pour les statistiques d'allègement

## Questions ouvertes

1. **Le texte de substitution devrait-il inclure un hachage pour permettre une
   réinflation future ?** Aujourd'hui nous émettons juste `[image: image/png]`. Si/quand un
   outil de type `read_paste` arrive, nous pourrions vouloir un identifiant. Pour l'instant le
   texte de substitution est informatif ; l'image d'origine existe toujours dans
   l'historique en direct et la persistance.
2. **`imageTokenEstimate = 1600` est-il correct pour les modèles non-Qwen-VL servis
   via des proxys Anthropic / OpenAI ?** Probablement une légère sous-estimation
   pour Claude (où les images peuvent atteindre ~5K jetons) mais inoffensive : cela
   n'affecte que l'heuristique du point de découpage, jamais l'invite réelle que
   le modèle destiné à l'utilisateur voit.
3. **La barrière `MIN_COMPRESSION_FRACTION` est calculée sur les nombres de caractères avant allègement.**
   Une tranche riche en images peut dépasser le seuil de 5 % (parce que les images
   comptent pour ~6 400 caractères chacune dans l'estimateur) puis rétrécir
   en espaces réservés `[image: …]` après allègement. Le modèle de résumé
   reçoit alors presque aucun contexte textuel. C'est intentionnel pour
   l'instant : le travail du résumé est d'enregistrer « l'utilisateur a partagé une image de X »
   même lorsque la majeure partie de la tranche était visuelle, et le but de la barrière
   est « y a-t-il assez de contenu pour valoir la peine d'être résumé » — ce que les images
   satisfont raisonnablement. Si la qualité régresse, nous pouvons réexaminer soit en
   vérifiant après allègement, soit en pondérant la barrière sur la
   proportion `imagesStripped`.

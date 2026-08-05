# Plafond adaptatif d'appels d'outils par tour

Date : 2026-07-17
Statut : Implémenté
Domaine : détection de boucle dans `packages/core`

## Problème

Le plafond toujours actif d'appels d'outils par tour (`model.maxToolCallsPerTurn`, 100 par défaut)
est un coupe-circuit brutal : il arrête le tour au 101e appel d'outil, que le modèle
soit réellement bloqué ou en train de faire un travail productif. Les grands tours d'implémentation
multi-packages dépassent légitimement 100 appels d'outils, donc le plafond
tue un travail productif — un faux positif.

Cas concret : session `80db472f-…` (qwen-code-x1, « Web Shell git status/diff
chip »). Le tour `继续Phase 2` a effectué exactement 100 appels d'outils et a été arrêté de force
en plein `npm run build` sans résumé de complétion. Analyse de ce tour et de ses
voisins :

| tour | appels d'outils | clés distinctes (tool,args) | répétition max d'une clé | série max de même nom |
| ---- | ---------- | ------------------------- | --------------------- | -------------------- |
| 7    | 96         | 96                        | 1                     | 7                    |
| 8    | 100        | 99                        | 2                     | 3                    |
| 9    | 95         | 95                        | 1                     | 7                    |

Les tours productifs sont très diversifiés : aucun appel `(tool, args)` unique ne se répète plus
de deux fois. Un tour réellement bloqué répète de nombreuses fois le même appel.

## Conception

Le comportement dépend de si `maxToolCallsPerTurn` a été **explicitement configuré**
(suivi par `Config.isMaxToolCallsPerTurnExplicit()`) :

- **Valeur explicite `N`** → un **plafond dur** (le contrat publié) : le tour
  s'arrête à l'appel qui dépasse `N`, sans extension adaptative. Cela préserve
  la rétrocompatibilité — un utilisateur qui a défini la valeur pour borner le coût sans surveillance
  obtient toujours exactement cette borne. (La v0.19.10 a livré le plafond comme plafond dur ; une
  itération antérieure de ce PR multipliait les valeurs explicites par 3, ce qui était un
  changement cassant — annulé.)
- **Défaut (non défini, `S = 100`)** → **adaptatif** : distinguer un long tour
  productif d'un tour bloqué en utilisant un signal de répétition, et n'arrêter de force que ce dernier
  (plus un filet de sécurité absolu). Les modèles modernes effectuent légitimement des centaines d'appels
  par tâche, donc le défaut ne doit pas arrêter de force les longs tours productifs.

Deux seuils pour le plafond adaptatif (défaut) :

- **Plafond souple `S`** (100) : lorsque le tour dépasse `S` appels d'outils, arrêter uniquement si un
  signal de répétition de blocage est présent ; sinon traiter le tour comme productif et
  le laisser continuer.
- **Plafond dur `S * ADAPTIVE_CAP_HARD_MULTIPLIER`** (multiplicateur 10 → 1000) :
  filet de sécurité absolu. Arrêter indépendamment de la répétition une fois dépassé, afin qu'un
  emballement qui fait varier les arguments à chaque appel (qu'aucun signal de répétition ne détecte) soit
  toujours borné. Le multiplicateur est suffisamment élevé pour que les tours productifs à centaines
  d'appels ne soient pas de faux positifs.

Signal de répétition de blocage : le nombre maximal de fois où une seule clé `(tool, args)`
est apparue dans le tour atteint `GLOBAL_DUPLICATE_THRESHOLD` (6). Cela
réutilise la sémantique existante des doublons globaux et dispose d'une large marge de sécurité
(tours productifs observés ≤ 2).

La série de même nom n'est volontairement PAS utilisée comme signal de garde : les lots d'outils
parallèles (par exemple plusieurs `read_file` de fichiers différents dans un message assistant)
produisent légitimement des séries de même nom de 6–7, trop proches du seuil de
stagnation d'action de 8.

### Suivi toujours actif

Le plafond est toujours actif (non contrôlé par `skipLoopDetection`), mais la map
`globalToolCallCounts` existante n'est maintenue que dans le chemin heuristique contrôlé.
Pour garder le plafond toujours actif indépendant du chemin contrôlé, le plafond maintient son
propre petit suiveur toujours actif :

- `capKeyCounts: Map<string, number>` — comptes par `(tool,args)` pour ce tour.
- `capMaxKeyRepeat: number` — maximum glissant du compte d'une clé unique.

Maintenu dans `checkAlwaysOnSafeties` pour chaque `ToolCallRequest`, effacé dans
`reset()` et lors d'un `Retry` (en cohérence avec la façon dont le chemin heuristique efface
`globalToolCallCounts` lors d'un retry).

## Matrice de comportement

Valeur explicite `N` (plafond dur) :

| appels totaux | résultat    |
| ----------- | ----------- |
| `≤ N`       | autorisé    |
| `> N`       | arrêt (dur) |

Défaut (non défini), plafond souple `S = 100`, plafond dur `H = 1000` :

| appels totaux   | signal de répétition   | résultat             |
| --------------- | -------------------- | ------------------ |
| `≤ S`           | quelconque           | autorisé           |
| `S < total ≤ H` | répétition max de clé `< 6` | autorisé (productif) |
| `S < total ≤ H` | répétition max de clé `≥ 6` | arrêt (bloqué)     |
| `> H`           | quelconque           | arrêt (filet de sécurité) |

Lorsque `S ≤ 0`, le plafond est désactivé (`getMaxToolCallsPerTurn()` renvoie
`Infinity`) ; le comportement est inchangé (ne se déclenche jamais).

## Fichiers modifiés

- `packages/core/src/config/config.ts` — suivi de `maxToolCallsPerTurnExplicit` +
  getter `isMaxToolCallsPerTurnExplicit()`.
- `packages/core/src/services/loopDetectionService.ts` — logique de plafond
  explicite-contre-défaut + suiveur toujours actif + clé canonisée d'appel d'outil.
- `packages/core/src/services/loopDetectionService.test.ts` — régression du plafond dur
  explicite + cas adaptatifs (défaut).
- `packages/core/src/core/client.test.ts` — test du budget du Stop-hook (plafond dur
  explicite).
- `packages/core/src/config/config.test.ts` — suivi du flag explicite.
- `packages/cli/src/config/settingsSchema.ts` — description de
  `maxToolCallsPerTurn`.
- `docs/users/configuration/settings.md` — idem.

## Non-objectifs / suivis

- Reprendre un tour arrêté là où il s'est arrêté (architecturalement irréalisable : le tour est
  déjà renvoyé lorsque le dialogue apparaît).
- Modifier l'UI du dialogue de détection de boucle (amélioration séparée).
- Un réglage de configuration séparé pour le plafond dur (dérivé du plafond souple ; augmenter
  `maxToolCallsPerTurn` fait évoluer les deux).
- Un signal de blocage par fenêtre de récence ou sensible aux résultats. Le signal actuel est un
  maximum monotone par tour : le même `(tool, args)` répété 6 fois n'importe où dans
  le tour le marque comme bloqué, même si ces répétitions sont légitimes (par exemple réexécuter
  le même build/test après des correctifs successifs). Ce n'est jamais une régression — le
  signal n'agit qu'au-delà du plafond souple, là où l'ancien plafond s'arrêtait toujours — mais cette
  classe productive n'en bénéficie pas. La preuve « les tours productifs se répètent ≤ 2 »
  provient de trois tours d'une seule session ; à revisiter avec un signal par fenêtre si la
  télémétrie montre ce schéma de faux blocage.
- La différenciation en télémétrie des deux raisons d'arrêt. Le blocage sur plafond souple et le
  filet de sécurité dur émettent tous deux `TURN_TOOL_CALL_CAP` ; un booléen/attribut sur
  `LoopDetectedEvent` dirait lequel s'est déclenché en production (utile pour valider
  le multiplicateur 10×). Le message headless couvre déjà les deux cas.
- Le chemin ACP/démon (`recordDaemonToolCalls` dans
  `packages/cli/src/acp-integration/session/Session.ts`) a son propre plafond brutal
  par tour qui n'utilise pas `LoopDetectionService`. Il traite toujours la
  valeur comme un plafond dur indépendamment de la répétition. L'aligner sur le défaut adaptatif est
  un suivi séparé (il suit les appels d'outils par lots et aurait besoin de son propre
  suivi de répétition par `(tool,args)`). Le chemin TUI interactif qui a produit
  le faux positif rapporté est corrigé ici.

# Effort de raisonnement unifié (/effort)

> **Statut d'implémentation.** Intégré : l'échelle à 5 niveaux + `core/reasoning-effort.ts`
> (limitation/normalisation du rang), le paramètre global `model.reasoningEffort` + les fonctions runtime
> `Config.setReasoningEffort`/`getReasoningEffort` (réappliquées lors des changements de modèle
> dans `handleModelChange`), la commande `/effort`, l'adaptateur de mise à plat verbatim GLM
> (`provider/zai.ts`), le mapping Gemini `medium`/`xhigh`,
> **le filtrage Anthropic par modèle** (`anthropicSupportedEffortTiers` + limitation : les familles
> Opus 4.7/4.8 et 5.x transmettent `xhigh`/`max` tels quels ; Opus 4.6/Sonnet 4.6 acceptent
> `max` uniquement ; Opus 4.5 et les identifiants sans version sont limités à `high`), ainsi que la
> ligne de statut `model-with-reasoning` (mise à jour en direct sur `/effort`), le
> mapping niveau→booléen DashScope (un effort défini active `enable_thinking` pour les modèles
> hybrides qwen ; la colonne unique à étendre lorsque qwen livrera un véritable
> champ `reasoning_effort`), et le `EffortDialog` interactif — `/effort` seul
> ouvre un sélecteur de niveau en mode interactif (et liste les niveaux en mode non interactif),
> câblé via `use-effort-command`, les contextes UI, `DialogManager`, et
> `useDialogClose`. Rien n'est différé.

## Problème

Chaque fournisseur capable de raisonnement expose un paramètre différent pour « à quel point le
modèle doit réfléchir » : OpenAI/DeepSeek/GLM utilisent une chaîne `reasoning_effort` plate,
Anthropic utilise `output_config.effort` (ainsi que l'ancien `thinking.budget_tokens`),
Gemini 3 utilise `thinking_level` (Gemini 2.5 utilisait `thinkingConfig.thinkingBudget`),
et Qwen/DashScope n'a qu'un booléen `enable_thinking`.

Le core possède déjà une structure de configuration unifiée `reasoning: { effort }` et chaque
adaptateur de fournisseur la traduit déjà (voir État actuel), mais il n'existe aucun moyen
côté utilisateur de choisir un niveau d'effort au runtime. Le niveau ne peut être défini qu'en
éditant manuellement la configuration de génération par modèle. Nous voulons une seule commande `/effort` qui
propose un petit ensemble de niveaux, les mappe sur ce que le fournisseur actif
prend en charge, et persiste le choix.

La couche unifiée doit également rendre l'ajout d'un nouveau fournisseur trivial : lorsqu'un modèle
qui n'a actuellement qu'un interrupteur marche/arrêt (par exemple qwen3) acquiert de vrais niveaux d'effort,
le seul changement devrait être une ligne dans la table de mapping/capacité.

## Objectifs

- Une échelle d'effort unifiée exposée à l'utilisateur : **`low | medium | high | xhigh | max`** (5 niveaux).
- Une commande slash `/effort` : `/effort <tier>` définit directement ; `/effort` seul ouvre une boîte de dialogue de sélection.
- Un **seul paramètre global** qui s'applique à tous les modèles, persisté entre les sessions.
- Une couche de traduction + **limitation** par fournisseur : un niveau non pris en charge revient au
  niveau pris en charge le plus proche pour le modèle actif, avec un avertissement unique
  (en réutilisant l'UX de limitation Anthropic existante).
- Affichage en direct via le preset de ligne de statut `model-with-reasoning` existant.
- Ajouter/ajuster un fournisseur = éditer une seule table de capacité/mapping, sans nouveau câblage.

## Hors objectifs

- Pas de niveau `off`. La désactivation complète du raisonnement reste le concept existant et séparé
  `reasoning: false` ; `/effort` navigue uniquement entre les niveaux actifs.
- Pas d'effort persisté par modèle (décision : paramètre global unique).
- Pas d'UI pour `budget_tokens` brut. Les fournisseurs basés sur un budget (Gemini 2.5, ancien
  Anthropic) sont pilotés par le mapping niveau→bucket, et non exposés numériquement.
- Aucun changement au câblage de requête par fournisseur existant au-delà du comblement des lacunes de mapping
  et des limitations.
- Pas d'intégration desktop (desktop a son propre câblage `thinkingLevel` ; hors sujet).

## État actuel

Type de configuration unifié — [`packages/core/src/core/contentGenerator.ts:104-118`] :

```ts
reasoning?: false | { effort?: 'low' | 'medium' | 'high' | 'max'; budget_tokens?: number }
```

Traducteurs par fournisseur existants :

| Fournisseur             | Fichier                                                                                   | Comportement                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DeepSeek             | `provider/deepseek.ts:176-218`                                                         | imbriqué → `reasoning_effort` plat ; `low/medium→high`, `xhigh→max`                                |
| Anthropic            | `anthropicContentGenerator.ts:521-593`, limitation `665-693`, beta hdr `393-431`            | `output_config.effort` + thinking ; limitation `max`→`high` + avertissement unique ; beta `effort-2025-11-24` |
| Gemini               | `geminiContentGenerator.ts:107-146`                                                    | `thinkingConfig`/`thinkingLevel` ; `low→LOW`, `high/max→HIGH`                                    |
| OpenAI/GLM/DashScope | `openaiContentGenerator/pipeline.ts:689-717` (`buildReasoningConfig`), strip `597-602` | transmet/supprime `reasoning_effort` ; DashScope ajoute `preserve_thinking`                          |

Lacunes : l'union manque de `xhigh` ; Gemini manque de `medium` et d'une règle `xhigh→high` ;
le pipeline générique doit être confirmé pour émettre `reasoning_effort` pour OpenAI/GLM purs
et pour limiter `max→xhigh` ; DashScope n'a pas de mapping niveau→booléen.

## État de l'art : openclaw

`openclaw/openclaw` résout le même problème avec une forme plus mature dont nous
nous inspirons (étudié dans `~/Documents/openclaw`) :

- **Échelle canonique unique + rangs numériques** (`src/auto-reply/thinking.shared.ts`) :
  `ThinkLevel = off|minimal|low|medium|high|xhigh|adaptive|max` avec
  `THINKING_LEVEL_RANKS` (off:0 … high:40, xhigh:60, max:70; adaptive≡30).
- **Limitation basée sur le rang** (`src/llm/model-utils.ts:59` `clampThinkingLevel`) : si le
  modèle prend en charge le niveau, il l'utilise ; une option explicite `null` pour refuser xhigh/max est une
  limite stricte (descente d'abord) ; sinon, préférer le prochain niveau pris en charge plus fort,
  sinon descendre — ne jamais augmenter silencieusement le coût au-delà de la limite d'un modèle.
- **Capacité par modèle**, et non seulement par fournisseur : le catalogue contient
  `compat.supportedReasoningEfforts` et un `thinkingLevelMap` par modèle
  (valeur ou `null`).
- **Trois mappeurs de forme**, un par famille d'API :
  - Compatible OpenAI — `mapThinkingLevelToReasoningEffort()` : `off→none`,
    `adaptive→medium`, `max→xhigh`, sinon transmission directe → `none|minimal|low|medium|high|xhigh`.
  - Anthropic — `mapThinkingLevelToEffort(model, level)` : limitation, puis émission de
    `output_config.effort` pour les modèles à pensée adaptative, ou conversion en
    `thinkingBudgetTokens` (avec `adjustMaxTokensForThinking`) pour les plus anciens.
  - Gemini — `resolveGoogleGemini3ThinkingLevel()` : Gemini 3 Pro → LOW/HIGH,
    Flash → MINIMAL/LOW/MEDIUM/HIGH ; Gemini 2.5 mappe un budget à un niveau
    (`≤0→MINIMAL, ≤2048→LOW, ≤8192→MEDIUM, sinon HIGH` ; `gemini-2.5-pro` rejette
    le budget 0 — pensée requise).
  - Wrapper DeepSeek V4 : `off`→suppression ; `xhigh|max→max`, sinon `high`.
- **Profil de pensée du fournisseur** (`src/plugins/provider-thinking.types.ts`) :
  déclare `levels`/`defaultLevel` ; les fournisseurs binaires stockent `low` mais affichent `on`.
- **Sanitiseur de raisonnement** (`extensions/opencode-go/reasoning-sanitizer.ts`) :
  supprime `reasoning_content`/`reasoning_effort` et les parties de pensée lors de la relecture
  de l'historique vers des fournisseurs qui les rejettent.

Ce que nous retenons : la **limitation centrale basée sur le rang**, la **déclaration de capacité
par modèle**, les **trois mappeurs de forme**, et les **buckets de budget Gemini 2.5 exacts**.
Ce que nous abandonnons pour la v1 : les niveaux utilisateur `minimal`/`adaptive` (décision = 5
niveaux) — ils restent des cibles de normalisation _internes_ valides afin qu'un catalogue de modèles puisse
encore les déclarer.

## Conception

### Échelle d'effort et table de capacités

Échelle ordonnée canonique : `low < medium < high < xhigh < max`.

Chaque fournisseur déclare un sous-ensemble pris en charge ; le traducteur limite un niveau demandé
**vers le bas** de l'échelle au niveau pris en charge le plus proche. Mapping (canonique →
valeur wire), avec `↓` marquant une limitation :

| Niveau   | OpenAI `reasoning_effort` | DeepSeek `reasoning_effort` | GLM-5.2+ `reasoning_effort` | Anthropic `output_config.effort` | Gemini 3 `thinking_level` | Qwen DashScope       |
| ------ | ------------------------- | --------------------------- | --------------------------- | -------------------------------- | ------------------------- | -------------------- |
| low    | low                       | high¹                       | low                         | low                              | low                       | enable_thinking:true |
| medium | medium                    | high¹                       | medium                      | medium                           | medium                    | true                 |
| high   | high                      | high                        | high                        | high (par défaut)                   | high                      | true                 |
| xhigh  | xhigh                     | max¹                        | xhigh                       | xhigh ↓high²                     | high ↓²                   | true                 |
| max    | xhigh ↓ (pas de `max`)        | max                         | max                         | max ↓high²                       | high ↓²                   | true                 |

¹ Regroupement interne documenté DeepSeek/GLM (low/medium ≡ high, xhigh ≡ max).
² Limité au plafond documenté du modèle (varie selon le modèle Anthropic ; Gemini 3
plafonne à `high`). Les modèles Gemini 2.5 mappent le niveau à un bucket `thinkingConfig.thinkingBudget`
au lieu de `thinking_level`.

La limitation est **centrale et basée sur le rang** (empruntée au
`clampThinkingLevel` d'openclaw) : attribuer un rang à chaque niveau
(`low:20, medium:30, high:40, xhigh:60, max:70`) ; un fournisseur/modèle déclare son
ensemble pris en charge (et des limites strictes `null` optionnelles pour `xhigh`/`max`) ; la limitation choisit
le niveau pris en charge le plus proche — les demandes à limite stricte descendent, sinon préférer le
prochain niveau pris en charge à ou en dessous de la demande. Cela remplace les limitations
ad-hoc par adaptateur (par exemple, l'actuel `max→high` d'Anthropic).

La capacité est déclarée **par modèle, et non seulement par fournisseur** (leçon d'openclaw) :
l'entrée de catalogue du modèle / le preset du fournisseur contient
`supportedReasoningEfforts?: EffortTier[]` (et une carte de
surcharge par modèle optionnelle). Par défaut si non défini = l'ensemble pris en charge complet du fournisseur. Un nouveau
fournisseur/modèle est une ligne de tableau ; la limitation + les trois mappeurs de forme restent inchangés.

Trois mappeurs de forme possèdent la traduction wire (un par famille d'API), alimentés par le
niveau déjà limité :

- `toReasoningEffort(tier)` — `reasoning_effort` plat OpenAI/DeepSeek/GLM/DashScope
  (DashScope à la place → booléen `enable_thinking`).
- `toAnthropicThinking(tier, model)` — `output_config.effort` pour les modèles adaptatifs,
  sinon `thinking.budget_tokens`.
- `toGeminiThinking(tier, model)` — `thinking_level` (Gemini 3) ou
  bucket `thinkingConfig.thinkingBudget` (Gemini 2.5, seuils selon openclaw).

### Hygiène des paramètres d'échantillonnage

DeepSeek et GLM rejettent `temperature`/`top_p`/`presence_penalty`/`frequency_penalty`
en mode pensée. Lorsqu'un traducteur active la pensée pour ces fournisseurs, il doit
supprimer ces paramètres d'échantillonnage du corps de la requête.

### Divergence de la forme des champs compatibles OpenAI

« Compatible OpenAI » n'implique PAS un champ d'effort unique. La configuration canonique est
l'objet imbriqué `reasoning: { effort }` ; `buildReasoningConfig()`
(`pipeline.ts:689-717`) le transmet **tel quel, sans mappage de valeur**. Chaque
fournisseur dont le champ wire diffère doit le remodeler dans son hook `buildRequest`.
Formes connues :

| Forme wire                           | Fournisseurs                                             | Gestion qwen-code                                                                                       |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `reasoning: { effort }` imbriqué       | OpenAI Responses, OpenRouter, gpt-5.x                 | transmission directe (par défaut) ✅                                                                                 |
| `reasoning_effort` plat de haut niveau    | DeepSeek, **GLM/z.ai**, OpenAI Chat Completions, Groq | L'adaptateur DeepSeek aplatit ✅ ; **GLM n'a pas d'adaptateur → expédie actuellement la forme imbriquée, probablement incorrect ❌** |
| booléen `enable_thinking`               | qwen3 / DashScope                                     | l'adaptateur émet un booléen (désactivation uniquement) ; pas encore de niveaux d'effort                                                   |
| toggle `extra_body.thinking.enabled` | GLM                                                   | interrupteur marche/arrêt séparé de la valeur d'effort                                                               |
Implication : le passthrough pur ne fonctionne "tout simplement" que pour les fournisseurs qui acceptent la forme imbriquée. **PR1 doit ajouter l'aplatissement pour GLM/z.ai** (en miroir de `deepseek.ts`) et, lorsque qwen ajoutera un champ d'effort, étendre l'adaptateur DashScope pour émettre la forme documentée par l'API de qwen (probablement un `reasoning_effort` plat). Un nouveau fournisseur n'est pris en charge automatiquement que s'il accepte la forme canonique imbriquée ; sinon, il nécessite un remodelage via un hook unique.

### Flux de configuration et persistance

- Nouveau paramètre global **`model.reasoningEffort`** : `'low' | 'medium' | 'high' | 'xhigh' | 'max'`, ajouté à `settingsSchema.ts` (près du nœud `generationConfig`, `1412-1504`).
- Au moment du build du content-generator, la couche de configuration mappe `model.reasoningEffort` vers `generationConfig.reasoning.effort` (source de vérité unique dans les traducteurs existants). Une seule valeur globale pour tous les modèles.
- Modification à l'exécution : ajouter `config.setReasoningEffort(tier)` (aux côtés de `switchModel`, `config.ts:~2047`) qui met à jour le `generationConfig.reasoning.effort` en mémoire et rafraîchit le ContentGenerator actif, puis `persistSetting('model.reasoningEffort', tier)`.

### Surface CLI

- Nouveau `effortCommand.ts` (modélisé sur `modelCommand.ts:39-79`) :
  - `/effort` → `{ type: 'dialog', dialog: 'effort' }`
  - `/effort high` → valider le niveau, appeler `config.setReasoningEffort`, persister, message d'acquittement.
  - `completion()` propose les 5 niveaux.
- Nouveau composant Ink `EffortDialog` + enregistrement du type de dialogue `'effort'` dans `commands/types.ts:168-198`. Le dialogue liste les 5 niveaux et indique lesquels seront écrêtés pour le modèle actuel (par ex. "max → high sur ce modèle").
- Ligne de statut : le preset existant `model-with-reasoning` (`statusLinePresets.ts:13,46-51`) lit l'effort en temps réel — pas de nouveau preset.

### Modification de type

Étendre l'union `effort` dans `contentGenerator.ts:104-118` pour ajouter `'xhigh'`. Le chemin de désactivation `reasoning: false` reste inchangé.

## Phasage (petites PR, chacune liée à une issue)

1. **core : échelle + mappages + écrêtages.** Étendre l'union avec `xhigh` ; ajouter l'écrêtage central basé sur le rang + `supportedReasoningEfforts` par modèle ; factoriser les trois mappeurs de forme ; remplir les buckets de budget Gemini `medium`/`xhigh↓` + 2.5, confirmer l'émission de `reasoning_effort` pour OpenAI/GLM + `max↓xhigh`, ajouter tier→bool pour DashScope ; suppression des paramètres d'échantillonnage ; vérifier que le chemin de suppression du raisonnement existant (`pipeline.ts:597-602`) couvre le rejeu de l'historique comme le sanitizer d'openclaw. Tests unitaires par traducteur de fournisseur + limites d'écrêtage. Pas d'UI.
2. **cli : paramètre + commande directe.** Schéma `model.reasoningEffort`, mappage de configuration + rafraîchissement à l'exécution de `setReasoningEffort`, `/effort <tier>`, lecture en temps réel de la ligne de statut. Tests.
3. **cli : dialogue de sélection.** `EffortDialog` + `/effort` nu, indications d'écrêtage par modèle.
4. **docs.** Page sur l'effort dans `docs/users/` ; liens croisés vers la documentation sur le raisonnement et le cache de tokens.

## Couverture des tests

Vérifications à plus forte valeur ajoutée : chaque traducteur de fournisseur émet le champ wire correct pour chaque niveau, y compris aux limites d'écrêtage (`max` sur OpenAI→`xhigh`, `xhigh`/`max` sur un modèle Gemini-3 / Anthropic plafonné→`high`) ; les paramètres d'échantillonnage sont supprimés lorsque le mode thinking est activé pour DeepSeek/GLM ; `model.reasoningEffort` fait un aller-retour à travers les paramètres et vers `generationConfig.reasoning.effort` ; `setReasoningEffort` reconstruit le ContentGenerator ; l'avertissement d'écrêtage unique se déclenche une seule fois par modèle+niveau.
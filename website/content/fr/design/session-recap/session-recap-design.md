# Conception du récapitulatif de session

> Un bref résumé (1 à 2 phrases) indiquant « où j'en étais », affiché lorsque l'utilisateur
> revient sur une session inactive, soit sur demande (`/recap`), soit après que le
> terminal a perdu le focus pendant plus de 5 minutes.

## Vue d'ensemble

Lorsqu'un utilisateur `/resume` une ancienne session plusieurs jours plus tard, faire défiler des
pages d'historique pour se souvenir de **ce qu'il faisait et de la prochaine étape**
constitue un véritable point de friction. Le simple rechargement des messages ne résout pas ce
problème d'UX.

L'objectif est d'afficher proactivement un bref récapitulatif de 1 à 2 phrases au retour de l'utilisateur :

- **Tâche de haut niveau** (ce qu'il fait) → **prochaine étape** (ce qu'il doit faire ensuite).
- Visuellement distinct des réponses réelles de l'assistant, afin de ne jamais être confondu
  avec une nouvelle sortie du modèle.
- **Best-effort** : les échecs doivent être silencieux et ne jamais interrompre le flux principal.

## Déclencheurs

| Déclencheur | Conditions                                                                                   | Implémentation                                                    |
| ----------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Manuel**  | L'utilisateur exécute `/recap`                                                               | `recapCommand.ts` appelle le même service sous-jacent             |
| **Auto**    | Terminal ayant perdu le focus (protocole DECSET 1004) pendant ≥ 5 min + retour du focus + flux `Idle` | `useAwaySummary.ts` — minuteur de 5 min + écouteur d'événement `useFocus` |

Les deux chemins convergent vers une seule fonction — `generateSessionRecap()` — pour
garantir un comportement identique. Le déclencheur automatique est conditionné par
`general.showSessionRecap` (par défaut : désactivé — opt-in explicite, afin que les appels
LLM en arrière-plan ne soient jamais ajoutés silencieusement à la facture de l'utilisateur) ; la commande
manuelle ignore ce paramètre.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 min blur timer + idle/dedupe gates                 │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (slash) ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌─────────────────────────┐               │
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └─────────────────────────┘               │
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage rendered inline like any other history       │
│         item (※ + bold "recap: " + italic content, all dim);           │
│         scrolls naturally with the conversation. Mirrors Claude        │
│         Code's away_summary system message.                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Fichiers

| Fichier                                                        | Responsabilité                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                   | Appel LLM ponctuel + filtre d'historique + extraction des balises                |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                  | Hook React de déclenchement automatique                                          |
| `packages/cli/src/ui/commands/recapCommand.ts`                 | Point d'entrée manuel `/recap`                                                   |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`   | Rendu `AwayRecapMessage` (`※` + `recap:` en gras + contenu en italique, tout estompé) |
| `packages/cli/src/ui/types.ts`                                 | Type `HistoryItemAwayRecap`                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`        | Aiguille les éléments d'historique `away_recap` vers le moteur de rendu          |
| `packages/cli/src/config/settingsSchema.ts`                    | Paramètres `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Conception du prompt

### Prompt système

`generationConfig.systemInstruction` remplace le prompt système de l'agent principal
pour cet appel unique, de sorte que le modèle se comporte uniquement comme un générateur de
récapitulatif et non comme un assistant de codage.

Notez que `GeminiClient.generateContent()` exécute en interne le prompt
via `getCustomSystemPrompt()`, qui ajoute la mémoire de l'utilisateur
(QWEN.md / mémoire automatique gérée) en suffixe. Le prompt système final est
donc `prompt de récapitulatif + mémoire utilisateur` — un contexte projet utile pour le
récapitulatif, et non une fuite.

Les puces ci-dessous correspondent 1:1 à `RECAP_SYSTEM_PROMPT` :

- Moins de 40 mots, 1 à 2 phrases simples (pas de markdown / listes / titres). Pour le chinois, considérez le budget comme environ 80 caractères au total.
- Première phrase : la tâche de haut niveau. Ensuite : la prochaine étape concrète.
- Interdiction explicite : lister ce qui a été fait, réciter les appels d'outils, rapports de statut.
- Correspondre à la langue dominante de la conversation (anglais ou chinois).
- Encadrer la sortie dans `<recap>...</recap>` ; rien en dehors des balises.

### Sortie structurée + Extraction

Le modèle est instruit d'encadrer sa réponse dans `<recap>...</recap>` :

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

Pourquoi : certains modèles (famille GLM, modèles de raisonnement) rédigent un paragraphe de "réflexion"
avant la réponse finale. Retourner le texte brut exposerait
ce raisonnement dans l'interface.

`extractRecap()` dispose de trois niveaux de repli :

1. Les deux balises présentes : prendre ce qui se trouve entre `<recap>...</recap>` (préféré).
2. Seule la balise ouvrante (ex. `maxOutputTokens` a tronqué la balise fermante) :
   prendre tout ce qui suit la balise ouvrante.
3. Balise entièrement absente : retourner une chaîne vide → le service retourne `null`
   → l'interface n'affiche rien.

Le troisième niveau suit le principe "mieux vaut ignorer qu'afficher une erreur" — exposer
le préambule de raisonnement du modèle est pire que de ne montrer aucun récapitulatif.

### Paramètres d'appel

| Paramètre           | Valeur                         | Raison                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | Le récapitulatif ne nécessite pas un modèle de pointe |
| `tools`             | `[]`                           | Requête ponctuelle, pas d'utilisation d'outils        |
| `maxOutputTokens`   | `300`                          | Marge pour 1 à 2 phrases courtes + balises            |
| `temperature`       | `0.3`                          | Principalement déterministe, avec une légère variation naturelle |
| `systemInstruction` | Le prompt de récapitulatif ci-dessus | Remplace la définition de rôle de l'agent principal   |

## Filtrage de l'historique

`geminiClient.getChat().getHistory()` retourne un `Content[]` qui
inclut :

- messages texte `user` / `model`
- parties `functionCall` du `model`
- parties `functionResponse` de l'`user` (qui peuvent contenir le contenu complet de fichiers)
- parties de réflexion du `model` (`part.thought` / `part.thoughtSignature`,
  le raisonnement caché du modèle)

`filterToDialog()` ne conserve que les parties `user` / `model` ayant un **texte non vide
et qui ne sont pas des réflexions**. Deux raisons :

- **Appels d'outils / réponses** : un seul `functionResponse` peut faire plus de 10K
  tokens. 30 messages de ce type noieraient le LLM de récapitulatif dans des détails non pertinents,
  gaspillant des tokens et biaisant le récapitulatif vers
  du bruit d'implémentation comme "a appelé l'outil X pour lire le fichier Y".
- **Parties de réflexion** : contiennent le raisonnement interne du modèle. Les inclure
  risque de traiter une chaîne de pensée cachée comme un dialogue et
  de l'exposer dans le texte du récapitulatif.

Après avoir supprimé les messages vides, `takeRecentDialog` découpe les 30 derniers
messages et refuse de commencer la découpe sur une réponse modèle/outil orpheline.

## Concurrence et cas limites

### Machine d'états du hook de déclenchement automatique

`useAwaySummary` conserve trois refs :

| Ref               | Signification                                     |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | Heure de début de perte de focus (non effacée tant que le focus n'est pas revenu) |
| `recapPendingRef` | Indique si un appel LLM est en cours              |
| `inFlightRef`     | `AbortController` actuellement en cours           |

Dépendances `useEffect` : `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Événement                                                            | Action                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                              | Annuler l'appel en cours + effacer `inFlightRef` + effacer `blurredAtRef`                                                              |
| `!isFocused` et `blurredAtRef === null`                              | Définir `blurredAtRef = Date.now()`                                                                                                    |
| `isFocused` et `blurredAtRef === null`                               | Retour anticipé (aucun cycle de perte de focus à gérer — premier rendu ou juste après un reset de perte de focus brève)                |
| `isFocused` et durée de perte de focus < 5 min                       | Effacer `blurredAtRef`, attendre le prochain cycle de perte de focus                                                                   |
| `isFocused` et perte de focus ≥ 5 min et `recapPendingRef`           | Retour (déduplication)                                                                                                                 |
| `isFocused` et perte de focus ≥ 5 min et `!isIdle`                   | **Conserver** `blurredAtRef` et attendre la fin du tour (`isIdle` est dans les dépendances, donc l'effet se redéclenche à la fin du streaming) |
| `isFocused` et perte de focus ≥ 5 min et `shouldFireRecap` retourne false | Effacer `blurredAtRef` et retourner — la conversation n'a pas assez évolué depuis le dernier récapitulatif (≥ 2 tours utilisateur requis, comme Claude Code) |
| `isFocused` et toutes les conditions remplies                        | Effacer `blurredAtRef`, définir `recapPendingRef = true`, créer `AbortController`, envoyer la requête LLM                              |

Le callback `.then` **revérifie** `isIdleRef.current` : si l'utilisateur a
lancé un nouveau tour pendant l'exécution du LLM, le récapitulatif arrivant en retard
est ignoré pour éviter de l'insérer au milieu d'un tour.

Le `.finally` efface `recapPendingRef`, et efface `inFlightRef` uniquement
si `inFlightRef.current === controller` (pour ne pas écraser un
contrôleur plus récent).

Un second `useEffect` annule le contrôleur en cours lors du démontage.

### Contrôle d'accès `/recap`

`CommandContext.ui.isIdleRef` expose l'état actuel du flux
(en miroir du motif existant `btwAbortControllerRef`). En
mode interactif, `recapCommand` refuse si `!isIdleRef.current`
**ou** `pendingItem !== null`. `pendingItem` seul est insuffisant
car une réponse normale du modèle s'exécute avec `streamingState === Responding`
et un `pendingItem` nul.

## Configuration et sélection du modèle

### Paramètres exposés à l'utilisateur

| Paramètre                                  | Par défaut | Notes                                                                              |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false`    | Déclenchement automatique uniquement. `/recap` manuel ignore ce paramètre.         |
| `general.sessionRecapAwayThresholdMinutes` | `5`        | Minutes de perte de focus avant le déclenchement auto au retour du focus. Correspond à la valeur par défaut de Claude Code. |
| `fastModel`                                | non défini | Recommandé (ex. `qwen3-coder-flash`) pour des récapitulatifs rapides et économiques. |

### Repli du modèle

`config.getFastModel() ?? config.getModel()` :

- L'utilisateur a défini un `fastModel` et il est valide pour le type d'authentification actuel
  → utiliser `fastModel`.
- Sinon → repli sur le modèle de session principal (fonctionne, mais plus coûteux
  et plus lent).

## Observabilité

`createDebugLogger('SESSION_RECAP')` émet :

- les exceptions interceptées depuis le chemin du récapitulatif (`debugLogger.warn`).

Tous les échecs sont **totalement transparents** pour l'utilisateur — le récapitulatif est une
fonctionnalité auxiliaire et ne génère jamais d'erreur dans l'interface. Les développeurs peuvent rechercher
la balise `[SESSION_RECAP]` dans le fichier de log de debug : écrit par défaut dans
`~/.qwen/debug/<sessionId>.txt` (`latest.txt` est un lien symbolique vers la session
actuelle) ; désactivable via `QWEN_DEBUG_LOG_FILE=0`.

## Hors périmètre

| Élément                                          | Pourquoi non                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| UI de progression pour `/recap` (spinner / pendingItem) | Une attente de 3 à 5 secondes est tolérable ; cela ajoute de la complexité.                                                            |
| Tests automatisés                                | Le service est petit (~150 lignes), testé manuellement en end-to-end dans un premier temps ; les tests unitaires pourront arriver dans une PR séparée. |
| Prompts localisés                                | Le prompt système s'adresse au modèle ; l'anglais est la base la plus fiable. Le modèle sélectionne la langue de sortie en fonction de la conversation. |
| Variable d'env `QWEN_CODE_ENABLE_AWAY_SUMMARY`   | Claude Code l'utilise pour maintenir la fonctionnalité active lorsque la télémétrie est désactivée ; le modèle de télémétrie actuel de Qwen Code n'en a pas besoin. |
| Récapitulatif auto à la fin de `/resume`         | Suite logique mais nécessite un point d'accroche dans `useResumeCommand` ; hors périmètre pour cette PR.                                 |
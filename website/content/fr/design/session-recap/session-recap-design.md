# Conception du récapitulatif de session

> Un résumé bref (1-2 phrases) du type « où en étais-je » qui s’affiche lorsque l'utilisateur revient sur une session inactive, soit à la demande (`/recap`), soit après que le terminal a été flouté pendant 5 minutes ou plus.

## Vue d'ensemble

Lorsqu'un utilisateur `/resume` une ancienne session plusieurs jours plus tard, remonter des pages d'historique pour se rappeler **ce qu'il faisait et la suite** est un véritable point de friction. Le simple rechargement des messages ne résout pas ce problème d'UX.

L'objectif est d'afficher proactivement un bref récapitulatif de 1 à 2 phrases lorsque l'utilisateur revient :

- **Tâche de haut niveau** (ce qu'il fait) → **prochaine étape** (quoi faire ensuite).
- Visuellement distinct des vraies réponses de l'assistant, pour qu'il ne soit jamais confondu avec une nouvelle sortie du modèle.
- **Au mieux** : les échecs doivent être silencieux et ne jamais interrompre le flux principal.

## Déclencheurs

| Déclencheur       | Conditions                                                                                   | Implémentation                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manuel**        | L'utilisateur exécute `/recap`                                                               | `recapCommand.ts` appelle le même service sous-jacent                                                                                             |
| **Automatique**   | Terminal flouté (protocole de focus DECSET 1004) pendant ≥ 5 min + retour du focus + flux en état `Idle` | `useAwaySummary.ts` — minuterie de flou de 5 min + écouteur d'événement `useFocus`                                                                 |
| **HTTP du démon** | Le client distant appelle `POST /session/:id/recap`                                          | route `server.ts` → `bridge.generateSessionRecap` (aller-retour ext-method) → `acpAgent.ts` appelle `generateSessionRecap(session.getConfig(), signal)` |

Les trois chemins convergent vers la même fonction `generateSessionRecap()` dans `core/services/sessionRecap.ts` pour garantir un comportement identique. Le déclencheur automatique est conditionné par `general.showSessionRecap` (par défaut : désactivé — adhésion explicite, de sorte que les appels LLM ambiants ne soient jamais ajoutés silencieusement à la facture d'un utilisateur) ; la commande manuelle et la route HTTP du démon ignorent ce paramètre (l'appelant fait une demande explicite).

### Chemin d'accès du démon

La route du démon n'est pas strictement contrôlée (elle reflète la posture de `/session/:id/prompt` — le récapitulatif coûte des jetons mais ne modifie aucun état). La balise de capacité `session_recap` annonce la route sur `/capabilities.features`. Helpers SDK : `DaemonClient.recapSession(sessionId, opts)` et `DaemonSessionClient.recap(opts)`. Voir `docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap` pour le contrat filaire et l'enveloppe d'erreur.

L'annulation est **absente dans v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est transmis à `bridge.generateSessionRecap`, et le gestionnaire enfant ACP passe un `AbortController().signal` qui n'annule jamais au helper central (pas encore de mécanisme d'annulation inter-processus). Les seuls plafonds sont la limite de 60s `SESSION_RECAP_TIMEOUT_MS` du pont et la course à la fermeture du transport contre la mort du canal ACP. Câbler un AbortController côté HTTP de manière isolée serait cosmétique — l'appel LLM côté enfant s'exécuterait jusqu'au bout, donc une annulation de bout en bout n'est pas réalisable sans la pièce d'annulation inter-processus. C'est acceptable pour v1 car le récapitulatif est court (requête latérale à tentative unique, `maxOutputTokens: 300`, typiquement ~1–5s). Une future méthode d'extension d'annulation basée sur un ID de requête pourrait implémenter l'annulation complète de bout en bout si/ quand le coût en bande passante le justifie.

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

| Fichier                                                       | Responsabilité                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                  | Appel LLM unique + filtre d'historique + extraction d'étiquettes                 |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                 | Hook React à déclenchement automatique                                           |
| `packages/cli/src/ui/commands/recapCommand.ts`                | Point d'entrée manuel `/recap`                                                   |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`  | Rendu de `AwayRecapMessage` (※ + gras `recap:` + contenu en italique, tout atténué) |
| `packages/cli/src/ui/types.ts`                                | Type `HistoryItemAwayRecap`                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`       | Distribue les éléments d'historique `away_recap` au rendu                        |
| `packages/cli/src/config/settingsSchema.ts`                   | Paramètres `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Conception du Prompt

### Prompt Système

`generationConfig.systemInstruction` remplace le prompt système de l'agent
principal pour cet appel unique, de sorte que le modèle se comporte uniquement
comme un générateur de récapitulatif et non comme un assistant de codage.

Notez que `GeminiClient.generateContent()` exécute en interne le prompt
via `getCustomSystemPrompt()`, qui ajoute la mémoire de l'utilisateur
(QWEN.md / mémoire automatique gérée) en suffixe. Le prompt système final est
donc `prompt de récapitulatif + mémoire utilisateur` — un contexte de projet
utile pour le récapitulatif, et non une fuite.

Les points ci-dessous correspondent 1:1 avec `RECAP_SYSTEM_PROMPT` :

- Moins de 40 mots, 1-2 phrases simples (pas de markdown / listes / titres). Pour le chinois, considérez un budget d'environ 80 caractères au total.
- Première phrase : la tâche de haut niveau. Ensuite : l'étape concrète suivante.
- Interdit explicitement : lister ce qui a été fait, réciter les appels d'outils, les rapports d'état.
- Correspondre à la langue dominante de la conversation (anglais ou chinois).
- Encadrer la sortie avec `<recap>...</recap>` ; rien en dehors des balises.

### Sortie Structurée + Extraction

Le modèle est invité à encadrer sa réponse dans `<recap>...</recap>` :

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

Pourquoi : certains modèles (famille GLM, modèles de raisonnement) écrivent un
paragraphe de « réflexion » avant la réponse finale. Renvoyer le texte brut
ferait fuiter ce raisonnement dans l'interface utilisateur.

`extractRecap()` a trois niveaux de secours :

1. Les deux balises présentes : prendre ce qui est entre `<recap>...</recap>` (préféré).
2. Seulement la balise ouvrante (par exemple `maxOutputTokens` a tronqué la balise fermante) : prendre tout après la balise ouvrante.
3. Balise complètement manquante : renvoyer une chaîne vide → le service renvoie `null` → l'interface utilisateur n'affiche rien.

Le troisième niveau est « éviter plutôt que montrer la mauvaise chose » — afficher le préambule de raisonnement du modèle est pire que de ne montrer aucun récapitulatif.

### Paramètres d'Appel

| Paramètre           | Valeur                          | Raison                                                  |
| ------------------- | ------------------------------- | ------------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()`  | Le récapitulatif n'a pas besoin d'un modèle de pointe   |
| `tools`             | `[]`                            | Requête unique, pas d'utilisation d'outil               |
| `maxOutputTokens`   | `300`                           | Marge pour 1-2 phrases courtes + balises                |
| `temperature`       | `0.3`                           | Principalement déterministe, avec un peu de variation naturelle |
| `systemInstruction` | Le prompt de récapitulatif uniquement ci-dessus | Remplace la définition du rôle de l'agent principal     |

## Filtrage de l'Historique

`geminiClient.getChat().getHistory()` renvoie un `Content[]` qui inclut :

- messages texte `user` / `model`
- parties `functionCall` du `model`
- parties `functionResponse` du `user` (qui peuvent contenir le contenu complet des fichiers)
- parties de réflexion du `model` (`part.thought` / `part.thoughtSignature`, le raisonnement caché du modèle)

`filterToDialog()` ne conserve que les parties `user` / `model` qui ont un **texte non vide et ne sont pas des réflexions**. Deux raisons :

- **Appels / réponses d'outils** : un seul `functionResponse` peut faire 10K+ tokens. 30 messages de ce type noieraient le LLM de récapitulatif dans des détails non pertinents, gaspillant des tokens et biaisant le récapitulatif vers du bruit d'implémentation comme « a appelé l'outil X pour lire le fichier Y ».
- **Parties de réflexion** : portent le raisonnement interne du modèle. Les inclure risque de traiter la chaîne de pensée cachée comme un dialogue et de la faire apparaître dans le texte du récapitulatif.

Après avoir supprimé les messages vides, `takeRecentDialog` découpe jusqu'aux 30 derniers messages et refuse de commencer la découpe sur une réponse modèle/outil pendante.
## Concurrence et cas limites

### Machine d'état du hook de déclenchement automatique

`useAwaySummary` conserve trois refs :

| Ref               | Signification                                                |
| ----------------- | ------------------------------------------------------------ |
| `blurredAtRef`    | Heure de début du flou (pas effacée tant que le focus n'est pas revenu) |
| `recapPendingRef` | Indique si un appel LLM est en cours                         |
| `inFlightRef`     | Le `AbortController` actuellement en vol                       |

Dépendances de `useEffect` : `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Événement                                                    | Action                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                      | Annuler l'appel en cours + effacer `inFlightRef` + effacer `blurredAtRef`                                                        |
| `!isFocused` et `blurredAtRef === null`                      | Définir `blurredAtRef = Date.now()`                                                                                              |
| `isFocused` et `blurredAtRef === null`                       | Retour anticipé (aucun cycle de flou à gérer — premier rendu ou juste après une réinitialisation de flou bref)                  |
| `isFocused` et durée de flou < 5 min                         | Effacer `blurredAtRef`, attendre le prochain cycle de flou                                                                       |
| `isFocused` et flou ≥ 5 min et `recapPendingRef`             | Retour (dédoublonnage)                                                                                                           |
| `isFocused` et flou ≥ 5 min et `!isIdle`                     | **Conserver** `blurredAtRef` et attendre la fin du tour (`isIdle` est dans les dépendances, donc l'effet se déclenche à nouveau lorsque le streaming se termine) |
| `isFocused` et flou ≥ 5 min et `shouldFireRecap` renvoie false | Effacer `blurredAtRef` et retour — la conversation n'a pas assez évolué depuis le dernier récapitulatif (≥ 2 tours utilisateur requis, miroir de Claude Code) |
| `isFocused` et toutes les conditions remplies                | Effacer `blurredAtRef`, définir `recapPendingRef = true`, créer un `AbortController`, envoyer la requête LLM                     |

Le callback `.then` **revérifie** `isIdleRef.current` : si l'utilisateur a commencé un nouveau tour pendant que le LLM était en cours, le récapitulatif arrivant tard est abandonné pour éviter de l'insérer en plein milieu d'un tour.

Le `.finally` efface `recapPendingRef` et efface `inFlightRef` uniquement si `inFlightRef.current === controller` (afin de ne pas écraser un contrôleur plus récent).

Un second `useEffect` annule le contrôleur en cours lors du démontage.

### Barrière `/recap`

`CommandContext.ui.isIdleRef` expose l'état actuel du flux (miroir du modèle existant `btwAbortControllerRef`). En mode interactif, `recapCommand` refuse lorsque `!isIdleRef.current` **ou** `pendingItem !== null`. `pendingItem` seul est insuffisant car une réponse normale du modèle s'exécute avec `streamingState === Responding` et un `pendingItem` nul.

## Configuration et sélection du modèle

### Réglages visibles par l'utilisateur

| Réglage                                   | Par défaut | Remarques                                                                                   |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `general.showSessionRecap`                | `false`    | Déclenchement automatique uniquement. `/recap` manuel ignore ce réglage.                     |
| `general.sessionRecapAwayThresholdMinutes` | `5`        | Minutes de flou avant que le récapitulatif automatique ne se déclenche au retour du focus. Correspond à la valeur par défaut de Claude Code. |
| `fastModel`                               | non défini | Recommandé (ex. `qwen3-coder-flash`) pour des récapitulatifs rapides et économiques.        |

### Modèle de repli

`config.getFastModel() ?? config.getModel()` :

- L'utilisateur a un `fastModel` défini et il est valide pour le type d'authentification actuel → utiliser `fastModel`.
- Sinon → revenir au modèle de session principal (fonctionne, mais plus coûteux et plus lent).

## Observabilité

`createDebugLogger('SESSION_RECAP')` émet :

- les exceptions attrapées du chemin de récapitulatif (`debugLogger.warn`).

Tous les échecs sont **totalement transparents** pour l'utilisateur — le récapitulatif est une fonctionnalité auxiliaire et ne remonte jamais dans l'interface. Les développeurs peuvent rechercher la balise `[SESSION_RECAP]` dans le fichier journal de débogage : écrit par défaut dans `~/.qwen/debug/<sessionId>.txt` (`latest.txt` est un lien symbolique vers la session en cours) ; désactiver via `QWEN_DEBUG_LOG_FILE=0`.

## Hors périmètre

| Élément                                                   | Raison                                                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Interface de progression pour `/recap` (spinner / pendingItem) | Une attente de 3 à 5 secondes est tolérée ; ajoute de la complexité.                                                                   |
| Tests automatisés                                         | Le service est petit (~150 lignes), testé de bout en bout manuellement d'abord ; les tests unitaires peuvent être ajoutés dans une PR séparée. |
| Invites localisées                                        | L'invite système est destinée au modèle ; l'anglais est le substrat le plus fiable. Le modèle sélectionne la langue de sortie à partir de la conversation. |
| Variable d'environnement `QWEN_CODE_ENABLE_AWAY_SUMMARY`  | Claude Code l'utilise pour maintenir la fonctionnalité active lorsque la télémétrie est désactivée ; le modèle de télémétrie actuel de Qwen Code n'en a pas besoin. |
| Récapitulatif automatique à la fin de `/resume`            | Un suivi naturel mais nécessite un point d'accroche dans `useResumeCommand` ; hors périmètre pour cette PR.                            |

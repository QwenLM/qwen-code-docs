# Conception du récapitulatif de session

> Un résumé court (1 à 2 phrases) de « où en étiez-vous » qui s'affiche lorsque l'utilisateur
> revient sur une session inactive, soit à la demande (`/recap`) soit après que le
> terminal a été flouté pendant 5 minutes ou plus.

## Aperçu

Lorsqu'un utilisateur `/resume` une ancienne session plusieurs jours plus tard, faire défiler
les pages d'historique pour se souvenir **de ce qu'il faisait et de la suite**
est un véritable point de friction. Recharger simplement les messages ne résout pas
ce problème d'expérience utilisateur.

L'objectif est de proposer de manière proactive un court récapitulatif d'une à deux phrases lorsque l'utilisateur
revient :

- **Tâche de haut niveau** (ce qu'il fait) → **étape suivante** (quoi faire ensuite).
- Visuellement distinct des vraies réponses de l'assistant, pour ne jamais être confondu
  avec une nouvelle sortie du modèle.
- **Au mieux** : les échecs doivent être silencieux et ne jamais interrompre le flux principal.

## Déclencheurs

| Déclencheur     | Conditions                                                                                   | Implémentation                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manuel**      | L'utilisateur exécute `/recap`                                                                | `recapCommand.ts` appelle le même service sous-jacent                                                                                              |
| **Automatique** | Terminal flouté (protocole de focus DECSET 1004) pendant ≥ 5 min + le focus revient + le flux est `Idle` | `useAwaySummary.ts` — minuteur de flou de 5 min + écouteur d'événement `useFocus`                                                                  |
| **HTTP du démon** | Un client distant appelle `POST /session/:id/recap`                                           | Route `server.ts` → `bridge.generateSessionRecap` (aller-retour ext-method) → `acpAgent.ts` appelle `generateSessionRecap(session.getConfig(), signal)` |

Les trois chemins convergent vers la même fonction `generateSessionRecap()`
dans `core/services/sessionRecap.ts` pour garantir un comportement identique. Le
déclencheur automatique est contrôlé par `general.showSessionRecap` (par défaut : désactivé —
opt-in explicite, pour que les appels LLM ambiants ne soient jamais silencieusement ajoutés à la
facture de l'utilisateur) ; la commande manuelle et la route HTTP du démon
ignorent ce paramètre (l'appelant fait une demande explicite).

### Chemin d'accès du démon

La route du démon est à accès non strict (elle reflète la posture de `/session/:id/prompt` —
le récapitulatif consomme des tokens mais ne modifie aucun état). La balise de capacité
`session_recap` annonce la route sur `/capabilities.features`. Helpers SDK :
`DaemonClient.recapSession(sessionId, opts)` et
`DaemonSessionClient.recap(opts)`. Voir
`docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap`
pour le contrat filaire et l'enveloppe d'erreur.

L'annulation est **absente dans v1**. La route n'écoute pas la déconnexion du client HTTP,
aucun `AbortSignal` n'est transmis à
`bridge.generateSessionRecap`, et le gestionnaire enfant ACP passe un
`AbortController().signal` jamais annulé au helper central (pas encore de
plomberie d'annulation inter-processus). Les seuls plafonds sont le backstop
`SESSION_RECAP_TIMEOUT_MS` de 60 s du pont et la course à la fermeture du transport
contre la mort du canal ACP. Câbler un `AbortController` côté HTTP de manière
isolée serait cosmétique — l'appel LLM côté enfant s'exécuterait
quand même jusqu'au bout, donc une annulation de bout en bout n'est pas réalisable sans la
pièce d'annulation inter-processus. Cela est acceptable pour v1 car le récapitulatif est court
(requête latérale en un seul essai, `maxOutputTokens: 300`, typiquement ~1–5 s).
Une future méthode ext basée sur un identifiant de requête pourra implémenter une annulation complète de bout en bout
si/ quand le coût en bande passante le justifie.

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

| Fichier                                                         | Responsabilité                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | Appel LLM unique + filtre d'historique + extraction de balise                              |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | Hook React pour le déclenchement automatique                                                          |
| `packages/cli/src/ui/commands/recapCommand.ts`               | Point d'entrée manuel `/recap`                                                      |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | Rendu de `AwayRecapMessage` (`※` + gras `recap:` + contenu en italique, tout atténué)      |
| `packages/cli/src/ui/types.ts`                               | Type `HistoryItemAwayRecap`                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | Distribue les éléments d'historique `away_recap` au moteur de rendu                            |
| `packages/cli/src/config/settingsSchema.ts`                  | Paramètres `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Conception du prompt

### Prompt système

`generationConfig.systemInstruction` remplace le prompt système de l'agent principal
pour cet appel unique, de sorte que le modèle se comporte uniquement comme un générateur
de récapitulatif et non comme un assistant de codage.

Notez que `GeminiClient.generateContent()` exécute en interne le prompt
via `getCustomSystemPrompt()`, qui ajoute la mémoire de l'utilisateur
(QWEN.md / auto-mémoire gérée) en suffixe. Le prompt système final est
donc `prompt de récapitulatif + mémoire utilisateur` — un contexte de projet utile pour le
récapitulatif, pas une fuite.

Les puces ci-dessous correspondent 1:1 avec `RECAP_SYSTEM_PROMPT` :

- Moins de 40 mots, 1 à 2 phrases simples (pas de Markdown / listes / titres). Pour le chinois, considérez le budget comme environ 80 caractères au total.
- Première phrase : la tâche de haut niveau. Ensuite : l'étape concrète suivante.
- Interdiction explicite : énumérer ce qui a été fait, réciter les appels d'outils, les rapports d'état.
- Correspondre à la langue dominante de la conversation (anglais ou chinois).
- Envelopper la sortie dans `<recap>...</recap>` ; rien en dehors des balises.

### Sortie structurée + extraction

Le modèle est invité à envelopper sa réponse dans `<recap>...</recap>` :

```
<recap>Refactoring de loopDetectionService.ts pour résoudre l'OOM des sessions longues. L'étape suivante est d'implémenter l'option B.</recap>
```

Pourquoi : certains modèles (famille GLM, modèles de raisonnement) écrivent un paragraphe
de « réflexion » avant la réponse finale. Renvoyer le texte brut divulguerait
ce raisonnement dans l'interface utilisateur.

`extractRecap()` a trois niveaux de repli :

1. Les deux balises présentes : prendre ce qui se trouve entre `<recap>` et `</recap>` (préféré).
2. Seulement la balise ouvrante (par exemple, `maxOutputTokens` a tronqué la balise fermante) :
   prendre tout ce qui suit la balise ouvrante.
3. Balise absente entièrement : renvoyer une chaîne vide → le service renvoie `null`
   → l'interface n'affiche rien.

Le troisième niveau signifie « ignorer plutôt que montrer la mauvaise chose » — afficher
le préambule de raisonnement du modèle est pire que de ne montrer aucun récapitulatif.

### Paramètres d'appel

| Paramètre           | Valeur                          | Raison                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | Le récapitulatif n'a pas besoin d'un modèle frontalier                   |
| `tools`             | `[]`                           | Requête unique, pas d'utilisation d'outils                           |
| `maxOutputTokens`   | `300`                          | Marge pour 1 à 2 phrases courtes + balises               |
| `temperature`       | `0.3`                          | Plutôt déterministe, avec une petite variation naturelle |
| `systemInstruction` | Le prompt de récapitulatif ci-dessus    | Remplace la définition du rôle de l'agent principal             |

## Filtrage de l'historique

`geminiClient.getChat().getHistory()` renvoie un `Content[]` qui
inclut :

- Messages texte `user` / `model`
- Parties `functionCall` du `model`
- Parties `functionResponse` de l'`user` (qui peuvent contenir le contenu complet des fichiers)
- Parties de réflexion du `model` (`part.thought` / `part.thoughtSignature`,
  le raisonnement caché du modèle)

`filterToDialog()` ne conserve que les parties `user` / `model` qui ont un **texte non vide
et ne sont pas des réflexions**. Deux raisons :

- **Appels / réponses d'outils** : une seule `functionResponse` peut faire 10K+
  tokens. 30 messages de ce type noieraient le LLM du récapitulatif dans des détails
  non pertinents, gaspillant des tokens et biaisant le récapitulatif vers du
  bruit d'implémentation comme « a appelé l'outil X pour lire le fichier Y ».
- **Parties de réflexion** : contiennent le raisonnement interne du modèle. Les inclure
  risque de traiter la chaîne de pensée cachée comme un dialogue et de
  l'afficher dans le texte du récapitulatif.

Après avoir supprimé les messages vides, `takeRecentDialog` tronque aux 30 derniers
messages et refuse de commencer la tranche sur une réponse de modèle / outil pendante.

## Concurrence et cas limites

### Machine d'état du hook de déclenchement automatique

`useAwaySummary` conserve trois refs :

| Ref               | Signification                                           |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | Heure de début du flou (non effacée jusqu'au retour du focus) |
| `recapPendingRef` | Indique si un appel LLM est en cours                  |
| `inFlightRef`     | Le `AbortController` en cours actuel           |

Dépendances `useEffect` : `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Événement                                                        | Action                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | Annuler l'appel en cours + effacer `inFlightRef` + effacer `blurredAtRef`                                                                      |
| `!isFocused` et `blurredAtRef === null`                         | Définir `blurredAtRef = Date.now()`                                                                                                        |
| `isFocused` et `blurredAtRef === null`                          | Retour anticipé (pas de cycle de flou à gérer — premier rendu ou juste après une réinitialisation de flou court)                                                |
| `isFocused` et durée de flou < 5 min                            | Effacer `blurredAtRef`, attendre le prochain cycle de flou                                                                                         |
| `isFocused` et flou ≥ 5 min et `recapPendingRef`               | Retour (dédoublonnage)                                                                                                                        |
| `isFocused` et flou ≥ 5 min et `!isIdle`                        | **Conserver** `blurredAtRef` et attendre la fin du tour (`isIdle` est dans les dépendances, donc l'effet se redéclenche lorsque le streaming se termine) |
| `isFocused` et flou ≥ 5 min et `shouldFireRecap` renvoie false | Effacer `blurredAtRef` et retour — la conversation n'a pas assez évolué depuis le dernier récapitulatif (≥ 2 tours utilisateur requis, reflète Claude Code) |
| `isFocused` et toutes les conditions remplies                               | Effacer `blurredAtRef`, définir `recapPendingRef = true`, créer `AbortController`, envoyer la requête LLM                                     |

Le callback `.then` **revérifie** `isIdleRef.current` : si l'utilisateur a
démarré un nouveau tour pendant que le LLM était en cours d'exécution, le récapitulatif arrivé
tardivement est ignoré pour éviter de l'insérer au milieu du tour.

Le `.finally` efface `recapPendingRef`, et efface `inFlightRef` uniquement
si `inFlightRef.current === controller` (afin de ne pas écraser un
contrôleur plus récent).

Un deuxième `useEffect` annule le contrôleur en cours lors du démontage.

### Contrôle de `/recap`

`CommandContext.ui.isIdleRef` expose l'état actuel du flux
(en miroir du motif existant `btwAbortControllerRef`). En
mode interactif, `recapCommand` refuse lorsque `!isIdleRef.current`
**ou** `pendingItem !== null`. `pendingItem` seul est insuffisant
car une réponse de modèle normale s'exécute avec `streamingState === Responding`
et un `pendingItem` nul.

## Configuration et sélection du modèle

### Paramètres utilisateur

| Paramètre                                    | Défaut | Notes                                                                               |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | Déclencheur automatique uniquement. Le `/recap` manuel ignore ceci.                                    |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | Minutes de flou avant que le récapitulatif automatique ne se déclenche au retour du focus. Correspond à la valeur par défaut de Claude Code. |
| `fastModel`                                | non défini   | Recommandé (par ex. `qwen3-coder-flash`) pour des récapitulatifs rapides et peu coûteux.                   |

### Repli du modèle

`config.getFastModel() ?? config.getModel()` :

- L'utilisateur a défini un `fastModel` et il est valide pour le type d'authentification actuel
  → utiliser `fastModel`.
- Sinon → utiliser le modèle de session principal (fonctionne, mais plus coûteux
  et plus lent).

## Observabilité

`createDebugLogger('SESSION_RECAP')` émet :

- les exceptions interceptées du chemin de récapitulatif (`debugLogger.warn`).

Tous les échecs sont **totalement transparents** pour l'utilisateur — le récapitulatif est une
fonctionnalité auxiliaire et ne se propage jamais dans l'interface utilisateur. Les développeurs peuvent rechercher
la balise `[SESSION_RECAP]` dans le fichier journal de débogage : écrit par défaut dans
`~/.qwen/debug/<sessionId>.txt` (`latest.txt` est un lien symbolique vers la session
actuelle) ; désactiver via `QWEN_DEBUG_LOG_FILE=0`.

## Hors de portée

| Élément                                             | Pourquoi pas                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface de progression pour `/recap` (spinner / pendingItem) | L'attente de 3 à 5 secondes est acceptable ; ajoute de la complexité.                                                                                           |
| Tests automatisés                                  | Le service est petit (~150 lignes), testé de bout en bout manuellement d'abord ; les tests unitaires peuvent arriver dans une PR séparée.                                   |
| Prompts localisés                                | Le prompt système est destiné au modèle ; l'anglais est le substrat le plus fiable. Le modèle sélectionne la langue de sortie à partir de la conversation. |
| Variable d'environnement `QWEN_CODE_ENABLE_AWAY_SUMMARY`          | Claude Code l'utilise pour garder la fonctionnalité active lorsque la télémétrie est désactivée ; le modèle de télémétrie actuel de Qwen Code n'en a pas besoin.            |
| Récapitulatif automatique à la fin de `/resume`               | Une suite naturelle mais nécessite un point d'accroche dans `useResumeCommand` ; hors de portée pour cette PR.                                              |
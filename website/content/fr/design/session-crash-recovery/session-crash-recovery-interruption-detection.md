# Récupération de crash de session et design du service de récupération unifié

## 1. Objectifs de design

Le service de récupération (Recovery Service) est la couche de décision
unifiée pour la récupération de session. Il lit l'historique de session
récupéré, classifie l'état de récupération courant, construit les réparations
de protocole et les payloads de continuation nécessaires pour avancer, et
expose le même résultat aux points d'entrée TUI, démon, SDK et headless.

Les capacités existantes incluent :

- Le stockage de session JSONL en ajout seul.
- Le chargement de session et la reconstruction de l'historique API.
- La réparation des `tool_use` / `tool_result` orphelins.
- La détection d'interruption à trois états.
- Les points d'entrée de continuation pour le headless, le contrôle
  nonInteractive et ACP.

Le problème principal aujourd'hui n'est pas que la capacité de récupération
manque entièrement. Le problème est que :

- Les décisions de récupération sont réparties sur plusieurs points d'entrée.
- La TUI / le démon / le SDK ne voient pas le même état de récupération.
- La réparation se produit implicitement à bas niveau et n'est visible ni par
  les utilisateurs ni par les clients.
- Tout futur état de récupération devrait être câblé à répétition dans
  plusieurs points d'entrée.

Les objectifs d'un service de récupération unifié sont :

- Classification unifiée : chaque point d'entrée utilise le même plan de
  récupération.
- Réparation unifiée : chaque point d'entrée réutilise la même réparation de
  paires d'outils et la même classification d'interruption.
- Visibilité unifiée : la TUI / le démon / le SDK peuvent tous dire si une
  reprise est propre, interrompue ou dégradée.
- Données de débogage unifiées : les réparations, les résultats synthétisés
  et les suppressions sont exposés comme sortie structurée pour l'affichage
  et les logs.
- Tests unifiés : les mêmes fixtures de crash peuvent couvrir le plan core et
  chaque adaptateur de point d'entrée.

## 2. Design core : service de récupération

Ajouter un service core :

```text
packages/core/src/core/session-recovery.ts
```

Il n'affiche pas d'UI et n'exécute pas d'outils. Sa seule responsabilité est
de produire un `SessionRecoveryPlan` déterministe à partir de la
transcription de session et de l'historique de chat courant.

Types suggérés :

```ts
export type SessionRecoveryKind =
  | 'clean'
  | 'interrupted_prompt'
  | 'interrupted_turn'
  | 'degraded_history';

export type RecoveryRepair =
  | { type: 'synthesized_tool_result'; callId: string; name: string }
  | { type: 'dropped_duplicate_tool_result'; callId: string; name: string }
  | { type: 'history_gap'; childUuid: string; missingParentUuid: string };

export interface SessionRecoveryPlan {
  planId: string;
  sessionId: string;
  kind: SessionRecoveryKind;
  originalApiHistory: Content[];
  apiHistory: Content[];
  repairs: RecoveryRepair[];
  canContinue: boolean;
  canAutoContinue: boolean;
  requiresUserConfirmation: boolean;
  visibleNotice?: string;
  continuation?: {
    mode: 'retry_user_parts' | 'tool_result_parts';
    parts: Part[];
    displayText: string;
  };
}
```

Point d'entrée suggéré :

```ts
export function buildSessionRecoveryPlan(input: {
  sessionId: string;
  conversation: ConversationRecord;
  historyGaps?: HistoryGap[];
  options?: {
    allowAutoContinue?: boolean;
  };
}): SessionRecoveryPlan;
```

Flux core :

1. Construire `originalApiHistory` depuis `ConversationRecord`.
2. S'il existe des `historyGaps` non ignorables, classifier la session comme
   `degraded_history`.
3. Exécuter `detectTurnInterruption` sur `originalApiHistory`. Cela doit se
   produire avant la réparation. Sinon un `model[functionCall]` pendant
   serait d'abord fermé par un `functionResponse` synthétique, rendant
   impossible la classification de l'état comme `interrupted_turn`.
4. Cloner `originalApiHistory` en un historique sûr pour le provider,
   exécuter le `repairOrphanedToolUseTurns` existant sur le clone et stocker
   le résultat dans `plan.apiHistory`.
5. Construire le payload de continuation à partir de la classification :
   - `interrupted_prompt` : rejouer les parties utilisateur de queue avec la
     sémantique Retry.
   - `interrupted_turn` : fermer les appels d'outil pendants avec des parties
     `functionResponse` d'erreur synthétiques.
6. Produire `visibleNotice` et `repairs` pour l'affichage et le débogage de
   l'UI / du démon / du SDK.

Compatibilité de nommage :

- Continuer d'utiliser la chaîne de protocole publique existante
  `interrupted_turn` ; ne pas ajouter `interrupted_tool_turn`. Le contrôle
  nonInteractive, ACP et les tests existants dépendent déjà de
  `interrupted_turn`, et le service de récupération ne doit pas ajouter de
  coût de migration.

## 3. Rôle et valeur du service de récupération

### 3.1 Robustesse

Un service unifié transforme le comportement de récupération actuellement
implicite et dispersé en une machine à états explicite.

État actuel :

- L'initialisation de la reprise répare les entrées `tool_use` orphelines,
  mais les points d'entrée ne savent pas toujours que cette réparation a eu
  lieu.
- Le headless / ACP peut continuer, mais la TUI ne sait pas quoi dire à
  l'utilisateur.
- Les trous de chaîne parente ont déjà une gestion visible partielle :
  `SessionService.loadSession` renvoie `historyGaps`, et la TUI / ACP peuvent
  afficher des notifications de trou. Cependant, il n'y a toujours pas de
  métadonnées de récupération unifiées ni de politique de mode sûr
  cohérente.

Après l'introduction du service de récupération :

- Chaque reprise produit d'abord un état explicite : `clean`,
  `interrupted_prompt`, `interrupted_turn` ou `degraded_history`.
- Chaque point d'entrée peut décider de continuer, de notifier ou de dégrader
  en se basant sur le même plan.
- Les trous d'historique ne sont pas traités silencieusement comme un
  historique propre.
- Si de nouveaux états de récupération sont ajoutés plus tard, seule la
  construction du plan doit être étendue ; chaque point d'entrée n'a pas
  besoin de réimplémenter la logique.

Le gain de robustesse est que la récupération passe de « chaque endroit
  répare un peu selon le besoin » à « chaque récupération a un résultat de
  classification unifié ».

### 3.2 Sécurité

Le plus grand risque de sécurité dans la récupération est de répéter
automatiquement des actions à effet de bord, comme des commandes shell, des
écritures de fichiers ou des appels API externes.

Principes de sécurité du service de récupération :

- Ne pas rejouer automatiquement par défaut les outils inconnus.
- Convertir par défaut les appels d'outil pendants en parties
  `functionResponse` échouées, et laisser le modèle décider s'il doit
  retenter.
- `interrupted_turn` a par défaut `requiresUserConfirmation = true` sauf si
  l'appelant s'y engage explicitement par opt-in.
- `degraded_history` n'est jamais continué automatiquement.
- Toutes les réparations synthétiques sont incluses dans `repairs` pour les
  logs et le débogage.

Cela donne la priorité à :

- Les providers ne reçoivent pas d'historique invalide.
- Les utilisateurs ne répètent pas d'actions dangereuses à cause de la
  logique de récupération.
- La TUI / le SDK peuvent montrer clairement quels résultats d'outil ont été
  synthétisés comme échecs de récupération.

La valeur de sécurité est que la récupération ne reprend pas aveuglément
l'exécution. Elle répare d'abord la forme du protocole, puis continue avec
une politique conservatrice.

### 3.3 Complétude

Ce design ne résout pas immédiatement chaque scénario de crash. Il se
concentre sur les états que les capacités actuelles peuvent classifier de
manière fiable.

Couverts immédiatement :

- Reprise propre.
- Prompt utilisateur de queue : `interrupted_prompt`.
- Soumission de résultat d'outil de queue : aussi classifiée comme
  `interrupted_prompt` et rejouée avec Retry.
- Appel d'outil pendant : `interrupted_turn`, avec des résultats d'outil
  d'erreur synthétisés.
- Résultat d'outil non adjacent : la réparation existante le hisse vers une
  position légale. La première version de ce plan n'enregistre pas les
  détails de hissage séparément sauf si l'API de réparation est étendue plus
  tard pour les renvoyer.
- Résultat d'outil dupliqué : suppression du doublon.
- Trou de chaîne parente : `degraded_history`.

Pas encore couverts :

- Un stream de texte du modèle qui se déconnecte en cours de route mais
  laisse une queue qui ressemble à du texte de modèle ordinaire.
- La distinction fine entre un abandon gracieux et un crash inconnu.

La complétude ici ne vient pas de l'ajout d'une grande quantité de code d'un
coup. Elle vient de la consolidation des capacités actuelles dans un plan
unifié afin que les états qui peuvent être classifiés aujourd'hui soient
gérés de manière cohérente.

### 3.4 Architecture logicielle

Le service de récupération doit vivre dans le core plutôt que dans la CLI, la
TUI, le démon ou un quelconque point d'entrée unique.

Raisons :

- `SessionService`, `buildApiHistoryFromConversation`, la réparation
  `GeminiChat` et `detectTurnInterruption` sont tous dans le core ou les
  couches adjacentes au core.
- La TUI / le headless / ACP / le démon / le SDK sont des adaptateurs.
- La classification de récupération est de la logique métier, pas de la
  logique d'affichage UI.

Découpage en couches suggéré :

```text
SessionService
  Lit le JSONL, reconstruit ConversationRecord, renvoie historyGaps

SessionRecoveryService
  Construit le RecoveryPlan depuis ConversationRecord + historyGaps

GeminiClient / GeminiChat
  Consomme plan.apiHistory pour initialiser le chat
  Exécute plan.continuation lorsque nécessaire

TUI / headless / ACP / démon / SDK
  Affiche plan.visibleNotice
  Déclenche la continuation depuis les requêtes utilisateur ou API
```

Bénéfices de ce découpage :

- Le core possède les faits et les décisions.
- L'UI possède l'affichage.
- Le démon / le SDK possèdent la sortie de protocole.
- Les tests peuvent exercer le plan core directement sans démarrer une TUI
  complète.

### 3.5 Visibilité et débogabilité

Le plan produit par le service de récupération doit être convertible en deux
types de sortie :

1. Notification visible par l'utilisateur :

```text
La session précédente s'est arrêtée après une exécution d'outil. 2 appels
d'outil non terminés ont été marqués comme échoués afin que l'historique
puisse être envoyé en toute sécurité. Vous pouvez continuer la tâche ; le
modèle décidera s'il doit retenter en se basant sur les résultats d'échec.
```

2. Log de débogage ou enregistrement système optionnel :

```ts
type RecoveryDebugPayload = {
  planId: string;
  kind: SessionRecoveryKind;
  repairs: RecoveryRepair[];
  timestamp: string;
};
```

Cette information n'entre pas dans l'historique API. Elle ne sert qu'au
diagnostic, à l'export et au débogage. La persister comme enregistrement
système peut être différé et n'est pas une exigence dure de ce design.

Valeur :

- Les utilisateurs savent ce qui s'est passé pendant la récupération.
- Les clients SDK peuvent afficher un état exact.
- Les rapports de bug peuvent inclure `planId` et `repairs`.
- La même queue interrompue a moins de chances d'être continuée
  automatiquement plusieurs fois.

## 4. Intégration des points d'entrée

### 4.1 TUI

Après `/resume` ou un démarrage avec `--resume` :

1. `SessionService.loadSession(sessionId)`.
2. `buildSessionRecoveryPlan(...)`.
3. `config.startNewSession(sessionId, sessionData, recoveryPlan)`, ou un
   mécanisme équivalent pour conserver le plan.
4. Charger l'historique UI.
5. Si `plan.kind !== 'clean'`, insérer un élément INFO.
6. Fournir `/continue` ou une action « Continue interrupted turn ».

La TUI ne continue pas automatiquement `interrupted_turn` /
`degraded_history` par défaut.

### 4.2 Contrôle headless / nonInteractive

`continueInterrupted` ou `continue_last_turn` n'appelle plus directement des
détecteurs dispersés. À la place :

1. Construire un plan depuis l'historique de chat courant ou la conversation
   reprise.
2. Si `plan.canContinue = false`, renvoyer un no-op.
3. Si la continuation est autorisée, exécuter `plan.continuation`.

### 4.3 ACP / démon

Ajouter des métadonnées de récupération à la réponse `loadSession` /
`resumeSession` :

```ts
{
  recovered: boolean;
  recoveryKind: SessionRecoveryKind;
  canContinue: boolean;
  requiresUserConfirmation: boolean;
  repairs: {
    type: string;
    count: number;
  }
  [];
}
```

`continueLastTurn` doit aussi accepter / rejeter en se basant sur le plan,
puis revalider immédiatement avant l'exécution.

### 4.4 SDK

L'intégration SDK doit distinguer deux catégories :

- SDK soutenu par le démon : consomme les métadonnées de récupération depuis
  les réponses `loadSession` / `resumeSession` du démon, affiche une bannière
  de récupération et permet à l'utilisateur ou à l'application hôte de
  déclencher la continuation.
- SDK soutenu par un processus : démarre la CLI via `ProcessTransport` et
  utilise les drapeaux `--resume` / `--continue`. Il a besoin de métadonnées
  de récupération équivalentes exposées via un message système stream-json ou
  un champ de protocole SDK.

Aucune des deux catégories de SDK ne doit comprendre directement le JSONL de
bas niveau ni la réparation de paires d'outils. Elles ne doivent consommer
que le résultat de récupération structuré exposé par la couche de point
d'entrée, et elles doivent bloquer la continuation automatique dans les états
dégradés.

## 5. Design des tests unitaires

Le service de récupération doit avoir des tests unitaires indépendants qui ne
dépendent ni de la TUI ni d'un véritable provider.

Fixtures core :

1. Historique propre :
   - Queue de texte du modèle.
   - Appel d'outil + résultat d'outil + modèle final complets.

2. `interrupted_prompt` :
   - La dernière entrée est du texte utilisateur.
   - La dernière entrée est un groupe de parties functionResponse
     utilisateur.
   - Plusieurs entrées utilisateur de queue.

3. `interrupted_turn` :
   - functionCall du modèle sans functionResponse.
   - Plusieurs functionCalls dont certains seulement sont terminés.
   - Un functionCall sans id est ignoré.

4. Réparation :
   - Un functionResponse non adjacent est hissé et l'historique sûr pour le
     provider est légal.
   - Un functionResponse dupliqué est supprimé.
   - La forme des résultats d'outil synthétiques reste cohérente avec la
     réparation existante.

5. `degraded_history` :
   - `historyGaps` est non vide.
   - Confirmer `canAutoContinue = false`.
   - Confirmer que `visibleNotice` inclut les informations de trou.

6. Checkpoint de compression :
   - La queue après la dernière compression est détectée correctement.
   - Les enregistrements système n'entrent pas dans l'historique API.

Tests d'adaptateurs de point d'entrée :

- La TUI `/resume` insère un élément INFO après réception d'un plan non
  propre.
- Le headless `continueInterrupted` utilise la continuation du plan et ne
  duplique pas le message utilisateur.
- ACP `continueLastTurn` renvoie le même type de récupération pour la même
  fixture.
- La réponse de `loadSession` du démon inclut les métadonnées de
  récupération.

L'objectif de test clé est : la même fixture d'historique doit produire le
même type de récupération dans le core / la TUI / ACP / le démon.

## 6. Conclusion

Un service de récupération unifié est le changement à la plus haute valeur à
ce stade, car il consolide pour l'essentiel des capacités existantes au lieu
d'introduire immédiatement de nombreux nouveaux mécanismes.

Sa valeur directe :

- Rend l'état de récupération cohérent au travers de la TUI / du démon / du
  SDK / du headless.
- Transforme la réparation existante des `tool_use` orphelins d'une étape
  implicite de prévention des 400 en un plan de récupération explicite.
- Transforme la continuation de tour interrompu d'une capacité locale du
  headless / d'ACP en une capacité core réutilisable.
- Fournit un point d'extension stable pour les futurs états de récupération.

Il ne résout pas à lui seul chaque problème de crash, en particulier les
crashs en plein stream de texte. Ce document garde volontairement ces
extensions hors du périmètre de ce cycle pour éviter le sur-design.
L'objectif actuel est d'unifier les capacités de récupération qui existent
déjà et peuvent être classifiées de manière fiable.

# SSE de génération sans état du démon

## Objectif

Ajouter `POST /session/:id/generate`, un endpoint SSE à portée de requête pour
une génération de texte courte et sans état. L'appelant fournit un `prompt` en
texte brut. L'enfant ACP résout d'abord le modèle rapide configuré et retombe
sur le modèle principal de la session lorsque le modèle rapide est absent ou ne
peut pas être résolu.

## Contrat

Le corps de la requête est `{ "prompt": string }`. Les prompts doivent être
non vides et ne pas dépasser 32 KiB en UTF-8. L'endpoint émet les événements
SSE `started`, `thinking` optionnel, `delta`, `done` et `error`. Il est
consommé avec `fetch`, car l'`EventSource` natif ne peut pas envoyer de corps
POST.

La génération est isolée de la conversation principale : elle ne lit ni ne
modifie l'historique de chat, n'utilise ni le system prompt principal ni la
mémoire, et envoie toujours `tools: []`. Les clients ne peuvent pas
sélectionner un modèle ni des paramètres de génération. Le contrat est
indépendant de toute tâche : la traduction est le premier consommateur du
Web Shell, pas une partie du schéma de l'endpoint.

## Architecture

La route demande à `AcpSessionBridge` un flux de génération. Le bridge crée un
ID de requête et enregistre une file bornée à portée de requête avant de
dispatcher `qwen/control/session/generation/start` à l'enfant ACP. L'enfant
essaie d'abord `config.getFastModel()`, retombe sur `config.getModel()`
pendant la résolution, crée le générateur de contenu correspondant via
`BaseLlmClient.resolveForModel`, et consomme
`generateContentStream`. Les chunks reviennent via
`qwen/notify/session/generation/event` et sont routés uniquement vers la file
de requête enregistrée. Ils ne sont pas publiés sur l'EventBus de la session
ni sur l'anneau de relecture.

La déconnexion du client envoie `qwen/control/session/generation/cancel` ;
l'enfant interrompt le contrôleur correspondant. Une file de bridge bornée
protège le démon d'un lecteur HTTP lent. L'écrivain HTTP respecte la
backpressure de `res.write()`.

## Fallback de modèle

Le fallback intervient uniquement au moment de la sélection. Un modèle rapide
absent ou invalide sélectionne le modèle principal. Une fois la génération
démarrée, les échecs du fournisseur terminent le flux ; changer de modèle
après que des deltas ont été émis dupliquerait ou mélangerait la sortie.

## Traduction du thinking du Web Shell

Les blocs de thinking terminés exposent une action de traduction au survol.
L'action reste visible tant que le bloc de thinking est déplié. Le Web Shell
envoie un prompt de traduction via cet endpoint et rend les deltas dans une
popover. Les comptages finaux de tokens d'entrée et de sortie apparaissent
sous la traduction. La popover peut annuler une requête en cours ou abandonner
le résultat mis en cache et traduire à nouveau. Un événement `thinking` sans
contenu rapporte la progression sans exposer le raisonnement. Les blocs de
thinking actifs n'exposent jamais l'action. Les traductions terminées sont
mises en cache dans la mémoire de la page par langue, message et contenu, de
sorte que rouvrir la popover n'effectue pas une nouvelle requête au modèle ;
un rafraîchissement de la page vide le cache.

## Non-objectifs

- Le contexte ou l'historique de conversation
- Les appels d'outils
- Les overrides arbitraires de modèle ou d'échantillonnage
- La relecture SSE ou la reprise de reconnexion
- Un registre de tâches ou des schémas spécifiques à une tâche
- Les modifications de `packages/core`

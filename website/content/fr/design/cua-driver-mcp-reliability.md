# Renforcement de la fiabilité MCP de cua-driver

## Problème

Le proxy MCP attend jusqu'à 120 secondes une réponse du démon. Plusieurs chemins
d'outils macOS peuvent bloquer plus longtemps que cela dans des appels OS synchrones.
Le proxy émet alors un `-32603` JSON-RPC générique, tandis que l'opération abandonnée
et le processus enfant continuent de tourner. Par ailleurs, le scope de capture est lu
à la fois en mémoire et sur disque, de sorte qu'une session MCP peut observer des
valeurs contradictoires après que `set_config` a signalé un succès.

## Design

### Une configuration effective par session

Traiter `capture_scope` comme l'override existant de taille d'image au niveau session.
Les appels MCP le résolvent à partir du `_session_id` de l'appelant ; les appels CLI
anonymes utilisent la valeur persistée globale par défaut. `set_config`, `get_config`
et `get_desktop_state` doivent tous résoudre via le même `ToolState`. La persistance
anonyme intervient avant que la valeur en mémoire soit validée, et un échec d'écriture
est renvoyé à l'appelant.

### Retirer les sous-processus de l'énumération d'applications

Utiliser `NSWorkspace.runningApplications` pour les applications live et les métadonnées
de bundle Core Foundation pour les applications installées. Cela retire `osascript` et
`plutil` des chemins de découverte de `list_apps`, `get_accessibility_tree` et
`launch_app`, plutôt que d'essayer de deviner un timeout sûr pour chaque bundle installé.

### Borner et terminer la capture d'écran

Conserver le backend `screencapture` existant, mais le lancer via un helper borné unique.
À l'échéance du deadline, tuer et récupérer le processus avant de renvoyer une erreur
d'outil. Utiliser un nom de chemin temporaire unique par capture et un garde de nettoyage
RAII afin que les appels concurrents ne puissent pas entrer en collision et que les échecs
ne laissent pas de fichiers derrière eux.

### Borner le travail AX et démon sous le deadline du proxy

Définir le timeout de messagerie AX natif avant les parcours d'arbre et les actions
d'élément. Ajouter côté démon un deadline d'outil plus court que le deadline de transport
de 120 secondes du proxy, comme dernier filet de sécurité. Les bornes internes doivent
normalement l'emporter ; le deadline du démon garantit qu'un blocage d'outil imprévu
devient une erreur au niveau outil plutôt qu'un `-32603`.

### Isoler l'endpoint de démon du fork

Utiliser une socket Unix par défaut et un répertoire de PID spécifiques à Qwen. Un ancien
démon upstream peut continuer à tourner sur la valeur upstream par défaut, mais le proxy
Qwen ne le réutilisera plus silencieusement pour exécuter une implémentation/version
différente de celle du binaire lancé par l'utilisateur. Les overrides explicites
`--socket` restent inchangés.

### Préserver le diagnostic de cycle de vie

Conserver la raison pour laquelle une session a reçu une pierre tombale (fin explicite,
expiration d'inactivité ou fin de connexion) et inclure cette raison dans le texte de
rejet. Conserver la réanimation explicite via `start_session`. Augmenter le TTL
d'inactivité par défaut afin qu'un long tour d'agent normal ne perde pas sa session après
seulement cinq minutes ; l'override d'environnement reste disponible pour les tests et
les déploiements.

### Faire exécuter le binaire du fork aux tests E2E

Résoudre `qwen-cua-driver` dans le testkit partagé. Un binaire manquant ne doit plus
transformer une assertion E2E prévue en un skip passé en zéro seconde lorsque le binaire
du fork est présent sous son nom réel.

## Non-objectifs

- Modifier le protocole JSON-RPC de MCP ou retenter des actions destructives.
- Rendre Tokio capable d'annuler des appels bloquants externes arbitraires ; les
  sous-processus OS sont tués directement et AX reçoit son timeout de messagerie natif.
- Modifier le comportement de normalisation des coordonnées.

## Vérification

Exécuter les mêmes cas boîte noire proxy/démon isolés que ceux utilisés pour la
reproduction avant correction : échec de persistance de configuration, shim d'énumération
d'applications bloqué, shim de capture d'écran bloqué, et TTL de session court/réanimation.
Les deux cas de blocage doivent revenir avant le deadline de 120 secondes du proxy,
ne laisser aucun processus enfant, et permettre un appel de suivi immédiat.

# Conception de référence pour les diagnostics mémoire

## Contexte

L'issue #3000 suit les diagnostics mémoire et performances pour les sessions Qwen Code de longue durée. La première PR doit établir une surface diagnostique petite et à faible risque avant d'ajouter des changements plus lourds de profilage ou de rétention.

La conception est d'abord une référence :

- Claude Code garde les diagnostics mémoire séparés de la génération de snapshots du tas. Ses diagnostics incluent la mémoire du processus, les statistiques du tas V8, les espaces du tas, l'utilisation des ressources, les handles/requêtes actifs, les descripteurs de fichiers, le `smaps_rollup` Linux et les indices de fuite.
- Codex se concentre fortement sur la rétention limitée et le chargement paresseux pour l'état des processus de longue durée. Ces idées devraient guider les PR ultérieures qui traitent de la conservation des conversations, des sorties de commandes et de l'historique.

## Périmètre de la première PR

Ajouter un chemin de diagnostic `/doctor memory` qui capture un instantané ponctuel :

- `process.memoryUsage()`
- statistiques du tas V8 et espaces du tas
- `process.resourceUsage()`
- compteurs de handles/requêtes actifs
- nombre de descripteurs de fichiers ouverts lorsque `/proc/self/fd` est disponible
- `smaps_rollup` Linux lorsqu'il est disponible
- indices de risque de base pour la pression du tas, les contextes détachés, les handles excessifs, les requêtes excessives, le nombre élevé de descripteurs de fichiers et la pression mémoire native

Cette commande doit être suffisamment légère pour être exécutée dans des sessions normales et sûre sur les plateformes où les sondes Linux uniquement ne sont pas disponibles.

## Objectifs exclus

Cette PR n'a pas pour objectif de :

- écrire des snapshots du tas
- exécuter un sondage continu
- modifier la rétention des invites/historique
- modifier la rétention des sorties d'outils
- modifier le comportement de chargement des modules

Ce sont des PR ultérieures après l'existence de la ligne de base diagnostique.

## PR ultérieures

1. Ajouter un support explicite de snapshot/export pour une investigation locale plus approfondie.
2. Ajouter une rétention limitée pour les sorties de commandes/outils volumineuses, en utilisant la rétention plafonnée des sorties de Codex comme référence principale.
3. Auditer les chemins de chargement paresseux et de démarrage des modules après que les mesures identifient les points chauds.
4. Ajouter des scénarios de benchmark mémoire/performance reproductibles pour les sessions de longue durée.
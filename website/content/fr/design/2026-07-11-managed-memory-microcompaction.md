# Préservation de la mémoire managée lors de la microcompaction

## Problème

Les fichiers de sujets de la mémoire managée sont chargés paresseusement avec `read_file`. La microcompaction traite actuellement ces résultats comme une sortie d'outil ordinaire et remplace les contenus plus anciens par `[Old tool result content cleared]`. L'index de mémoire reste disponible, et des correctifs récents permettent à un `read_file` ultérieur de renvoyer à nouveau les octets réels, mais rien ne garantit que le modèle actif remarque qu'il doit recharger la mémoire.

L'issue #6487 signale également un index obsolète après `/remember` ; le PR #6497 prend déjà en charge cette partie. Cette conception ne traite que du contenu de la mémoire managée supprimé par la microcompaction.

## Conception choisie

Ajouter un callback restreint `MicrocompactOptions` qui identifie les chemins `read_file` dont les résultats réussis doivent être préservés. Avant de construire les plans de nettoyage idle, forcés ou basés sur la taille, la microcompaction corrèle chaque réponse avec le `file_path` côté requête et retire les résultats protégés de l'ensemble compactable. Les autres outils, les lectures de fichiers ordinaires, les erreurs et les réponses dont le chemin ne peut pas être résolu conservent le comportement actuel.

Tous les points d'entrée de microcompaction de production fournissent le même prédicat :

- la compaction idle et basée sur la taille avant envoi
- `/compress-fast`
- la compaction d'historique sous pression mémoire

Le prédicat reconnaît les racines de mémoire managée de projet, d'utilisateur et d'équipe en utilisant une inclusion tenant compte des realpath. Les liens symboliques qui s'échappent d'une racine managée ne sont pas protégés.

## Pourquoi ce niveau

Injecter chaque corps de mémoire chargé dans l'instruction système ferait consommer du contexte par la mémoire en permanence et remplacerait la conception existante index-plus-lecture-paresseuse. Rattacher chaque fichier de mémoire après une compaction complète nécessiterait un budget de tokens séparé et une politique de restauration. Préserver uniquement les lectures de mémoire managée contre la microcompaction corrige directement le comportement de nettoyage reproduit, avec une modification bornée, et laisse la compaction complète comme frontière existante de réduction dure du contexte.

La compaction complète n'est donc volontairement pas préservatrice d'octets. Son résumé voit le contenu mémoire d'avant compaction, les index `MEMORY.md` restent dans l'instruction système, et le cache de lectures de fichiers est vidé afin que le modèle puisse recharger les octets exacts. Cette modification ne garantit la préservation qu'à travers la microcompaction.

## Risques et tests

Des lectures répétées de fichiers de mémoire managée peuvent conserver plusieurs copies jusqu'à la compaction complète. C'est un compromis intentionnel : les directives durables sont plus importantes que la récupération de ces tokens de résultats d'outil, tandis que la compaction complète reste disponible comme plafond dur.

Les tests couvrent les racines de projet, d'utilisateur et d'équipe ; les lectures ordinaires ; les échappements par liens symboliques ; les chemins idle, forcés et basés sur la taille ; les résultats mixtes protégés et compactables ; les IDs de réponse ambigus ou manquants ; et les métadonnées d'éviction.

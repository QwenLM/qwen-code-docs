# Inspection des branches de conversation

## Motivation

Les fichiers JSONL de session forment déjà un arbre via `uuid` et `parentUuid`, mais la reprise ne reconstruit actuellement qu'une seule queue physiquement sélectionnée. Un redémarrage peut donc masquer des historiques frères valides lorsque plusieurs écrivains ont ajouté à la même session ou lorsqu'un rewind a créé une seconde branche.

Ce changement ajoute un inspecteur de topologie en lecture seule. Il identifie chaque feuille sémantique, décrit sa relation avec les enregistrements de rewind explicites et produit un petit résumé déterministe. Il ne décide pas quelle branche est active.

## Frontière

L'inspecteur accepte des valeurs `ChatRecord` en mémoire et n'a aucune dépendance au système de fichiers, au service de session, au modèle ni à un écrivain. Le comportement existant de reprise, de fork, de pagination de transcription, du démon, d'ACP et du CLI reste inchangé.

La reconstruction de la branche sélectionnée continue d'utiliser `buildOrderedUuidChain` avec un `leafUuid` explicite. Un changement ultérieur côté écriture devra obtenir un snapshot de transcription exclusif et stable, demander à l'utilisateur ou à une politique durable de sélectionner l'une des feuilles rapportées, persister cette sélection et initialiser l'écrivain repris. Aucune de ces opérations de propriété n'appartient à l'inspecteur.

Claude Code possède un lecteur de transcription à toutes les feuilles pour l'analyse, tandis que son chemin de reprise normal sélectionne toujours la dernière feuille hors sidechain. Qwen ne peut pas utiliser en toute sécurité cette règle de sélection : un rewind explicite prouve une relation structurelle, mais dans une transcription multi-écrivains, il ne prouve pas que chaque frère a été intentionnellement abandonné.

## Feuilles sémantiques

Le premier enregistrement physique d'un UUID définit son parent, en cohérence avec le marcheur de chaîne existant. Les parents dupliqués contradictoires sont diagnostiqués plutôt que devinés.

Les enregistrements terminaux bruts sont normalisés à l'aide d'une liste d'autorisation de queue neutre délibérément petite : `custom_title`, `session_artifact_event` et `session_artifact_snapshot`. Ces enregistrements peuvent être ajoutés à côté ou après une queue de conversation sans créer une conversation récupérable distincte. Une séquence terminale de ceux-ci est réduite à son plus proche ancêtre non neutre connu. Si aucun tel ancêtre n'existe, la séquence uniquement constituée de métadonnées est omise, car ce n'est pas une branche de conversation reconstructible. Les candidats réduits sont dédupliqués, puis tout candidat qui est un ancêtre strict d'un autre candidat est retiré. Le résultat est une antichaîne de feuilles sémantiques.

Tous les autres enregistrements système restent significatifs. En particulier, les enregistrements de rewind, de compression, d'attribution et d'historique de fichiers peuvent porter un état de récupération et ne doivent pas être écartés simplement parce qu'ils n'ont pas de texte visible par l'utilisateur.

Les parents manquants arrêtent une chaîne à l'île de queue atteignable. Les cycles de parents sont rapportés et bornés. Le côté lecture ne reconnecte jamais l'historique manquant ni n'étiquette une branche comme active ou abandonnée.

## Résumés et relations de rewind

Les résumés sont locaux et déterministes. Ils incluent le point de branchement le plus proche, les nombres de messages, les horodatages, le premier texte utilisateur réel après le point de branchement, ainsi que les derniers textes utilisateur réel et assistant hors pensée. Les enregistrements de notification, de cron et utilisateur en cours de tour ne sont pas traités comme des prompts utilisateur. Le texte est normalisé pour les espaces et tronqué ; les arguments d'outils et les parties non textuelles sont ignorés. `updatedAt` utilise l'horodatage du dernier enregistrement physique terminal normalisé dans la feuille sémantique, afin que l'activité de métadonnées neutres ne soit pas perdue.

Une branche est un descendant de rewind lorsque son chemin contient un enregistrement de rewind. Elle est un frère de rewind lorsque son chemin diverge du chemin vers un enregistrement de rewind. Ce sont uniquement des étiquettes structurelles et elles n'impliquent jamais que le frère est obsolète.

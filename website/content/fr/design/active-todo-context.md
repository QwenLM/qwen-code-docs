# Contexte actif des todos

## Problème

`todo_write` présente la liste actuelle comme un rappel uniquement dans son propre résultat d'outil. Après d'autres appels d'outils, ce rappel perd de sa saillance et le modèle peut terminer le tour avec des éléments inachevés. Le fichier de todos persisté ne convient pas comme état de contrôle live, car il peut survivre à la chaîne de travail qui l'a créé.

## Conception

Après un `todo_write` réussi, conserver un rappel contenant uniquement les éléments inachevés sous un propriétaire stable de chaîne de travail. Les ID de prompt utilisés par les retries et les tours automatiques associés résolvent vers ce propriétaire, de sorte que les branches de notification concurrentes ne déplacent ni n'écrasent le rappel de premier plan. Les tâches en arrière-plan et les réveils de boucle capturent le propriétaire au moment de leur création et le rapportent avec leur tour automatique ; les tours cron et de notification sans rapport utilisent un propriétaire isolé qui est retiré à la fin du tour. Injecter le rappel à la première requête d'un retry ou d'un tour automatique associé, et après les réponses de fonction lors des tours d'outils ultérieurs. L'effacer lorsque tous les todos sont terminés, lorsqu'une nouvelle chaîne de travail ordinaire démarre ou lorsque la session change.

Chaque copie injectée est enregistrée définitivement dans l'historique du chat, de sorte qu'une injection à chaque tour ferait croître linéairement le contexte live avec les tours d'outils. L'injection lors des tours d'outils ne réémet donc le rappel qu'un tour d'outils sur trois depuis la dernière présentation de l'état (le résultat de `todo_write` lui-même compte) ; les injections en début de tour se déclenchent toujours et réinitialisent cette cadence. Le payload est une liste compacte de lignes `- [status] content` plafonnée à 800 caractères. L'historique reste en ajout seul, de sorte que le cache de préfixe du fournisseur n'est pas affecté.

Cela ne modifie pas la sémantique d'arrêt ni n'active `todoStopGuard`. La garde reste une récupération bornée optionnelle après qu'un modèle a déjà tenté de s'arrêter ; ce changement préserve à la place le contexte de la tâche avant cette décision.

## Vérification

- Une écriture réussie avec des éléments inachevés met à jour le rappel de session.
- Une liste terminée l'efface.
- Les messages de résultat d'outil Core et ACP ajoutent le rappel après les résultats de fonction.
- L'entrée utilisateur en cours de tour ACP reste en dernier et conserve donc la priorité.
- Un nouveau prompt ordinaire efface l'état obsolète tandis que retry/continue le conserve.
- Les tours automatiques indépendants sont isolés ; les tours automatiques associés héritent.
- Les tours automatiques terminaux libèrent leur état de propriété temporaire.

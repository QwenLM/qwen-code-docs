# Partage du cache de compression de chat

## Contexte

La compression de chat envoie actuellement une requête latérale à froid avec une instruction système dédiée, aucune déclaration d'outil de la session principale et une copie allégée des médias de la conversation. Les fournisseurs dont la clé de cache de prompt commence par les outils et l'instruction système ne peuvent pas réutiliser le préfixe mis en cache de la session principale.

## Conception

La compression tente d'abord une requête spécialisée à un seul tour lorsque toutes les conditions suivantes sont vraies :

- le modèle de compression est le modèle principal actuel ;
- le fournisseur actif est Anthropic ou DashScope et le cache control est activé ;
- le chat dispose d'un nombre de tokens de prompt rapporté par le fournisseur pour ancrer l'estimation ;
- le nombre effectif de tokens du prompt plus la réserve bornée de sortie de compression tient dans la fenêtre de contexte du modèle.

La requête utilise la configuration de génération effective du tour en cours, y compris les overrides d'outils par requête utilisés par les sous-agents, et l'historique organisé complet, y compris les médias. Le filtrage normal de modalité du modèle est appliqué au moment de l'envoi de la requête, de sorte que les médias pris en charge restent inchangés et que les médias non pris en charge utilisent les mêmes placeholders que les autres requêtes au modèle. L'instruction de compression existante est ajoutée comme dernier message utilisateur.
Rien ne consomme ni n'exécute d'appels de fonction de cette requête. Une réponse contenant un appel de fonction, une réponse vide, un snapshot d'état mal formé ou une erreur de requête est écartée et retentée une fois via la requête latérale à froid existante. Son entrée allégée des médias est construite paresseusement uniquement lorsque ce fallback est nécessaire. L'annulation ne déclenche pas le fallback.

Utiliser le `GeminiChat` en cours maintient la requête dans le périmètre de la session live. Le cache de fork global au processus n'est intentionnellement pas utilisé, car il ne conserve qu'une courte fin d'historique et peut appartenir à une autre session concurrente.

Les sessions utilisant un modèle de compaction distinct restent sur le chemin existant, car leur identité de cache diffère de celle de la session principale. Les historiques contenant des médias utilisent d'abord le chemin partagé afin que le préfixe inchangé côté fournisseur puisse réutiliser le cache de la session principale.

## Vérification

Les tests unitaires assertent la construction exacte du system, des tools, de l'historique complet et de la directive finale ; les gates par fournisseur/modèle ; la préservation des médias sur le chemin partagé ; le précontrôle de fenêtre ; l'allègement des médias après fallback ; le fallback en cas d'appel d'outil et de réponse mal formée ; et le comportement d'annulation. Les tests fournisseurs doivent comparer le préfixe de requête sérialisé et l'utilisation des tokens mis en cache pour le tour principal et la requête de compression.

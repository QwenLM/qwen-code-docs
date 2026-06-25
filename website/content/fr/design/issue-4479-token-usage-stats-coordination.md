# Problème #4479 - Coordination des statistiques d'utilisation des tokens

## Contexte

Le problème #4479 demande une visibilité quotidienne sur la consommation de tokens de Qwen Code. Le périmètre a été précisé dans le fil de discussion pour privilégier une commande CLI, une prise en charge de l'exportation, des résumés mensuels et une consommation par modèle. Un commentaire d'un mainteneur a également évoqué une coordination avec les travaux statistiques adjacents :

- #4252 : métriques de temporisation de génération dans `/stats` telles que TTFT, durée de génération et TPS.
- #4182 : compteurs à l'échelle de la session sans contenu pour le diagnostic mémoire.

## Décisions de coordination

1. **Utiliser `/stats`, pas une nouvelle commande de premier niveau.**
   L'utilisation des tokens est exposée via `/stats daily`, `/stats monthly` et `/stats export` afin de partager l'interface de commande statistiques existante avec les statistiques de session et les futures métriques de génération.

2. **Persister les compteurs de tokens en JSONL local.**
   Chaque réponse API ajoute un enregistrement sans contenu à `usage/token-usage-YYYY-MM.jsonl` dans le répertoire d'exécution. Cela satisfait l'agrégation quotidienne/mensuelle sans ajouter SQLite comme nouvelle dépendance.

3. **Garder la sémantique de temporisation de #4252 séparée.**
   Les résumés d'utilisation des tokens peuvent inclure `apiDurationMs`, qui est la durée de réponse API de bout en bout existante issue de la télémétrie. Ce champ est délibérément nommé durée API et ne doit pas être présenté comme durée de génération, TTFT ou TPS. #4252 reste propriétaire des métriques de temporisation de génération.

4. **Respecter les limites de confidentialité et de diagnostic mémoire de #4182.**
   Les enregistrements d'utilisation stockent uniquement des compteurs agrégés et des dimensions stables : date locale, mois, identifiant de session, modèle, type d'authentification, source, compteurs de tokens et durée API. Ils ne stockent pas le texte de l'invite, le texte de réponse, le contenu des outils, les chemins de projet, les identifiants d'invite ou les identifiants de réponse.

5. **L'exportation reste uniquement agrégée.**
   Les exportations CSV et JSON sont des résumés, pas des exportations de transcriptions brutes. Elles regroupent par total, modèle, type d'authentification, modèle/type d'authentification et source.

## Objectifs hors périmètre

- Ne pas implémenter ici l'instrumentation TTFT/TPS/durée de génération de #4252.
- Ne pas étendre `/doctor memory` ni implémenter #4182 dans cette modification.
- Ne pas ajouter une commande de premier niveau distincte pour l'utilisation des tokens.

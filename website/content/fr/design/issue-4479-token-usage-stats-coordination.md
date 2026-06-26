# Problème #4479 – Coordination des statistiques d’utilisation des tokens

## Contexte

Le problème #4479 demande une visibilité quotidienne de la consommation de tokens de Qwen Code. Le périmètre a été précisé dans le fil de discussion : préférence pour une commande CLI, prise en charge de l’export, résumés mensuels, et consommation par modèle. Un commentaire d’un mainteneur a également souligné la nécessité d’une coordination avec les travaux de statistiques adjacents :

- #4252 : métriques de chronométrage de génération dans `/stats` (TTFT, durée de génération, TPS).
- #4182 : compteurs à l’échelle de la session, sans contenu, pour le diagnostic mémoire.

## Décisions de coordination

1. **Utiliser `/stats`, pas une nouvelle commande de premier niveau.**
   L’utilisation des tokens est exposée via `/stats daily`, `/stats monthly` et `/stats export`, afin de partager la surface de commande existante avec les statistiques de session et les futures métriques de génération.

2. **Persister les compteurs de tokens au format JSONL local.**
   Chaque réponse API ajoute un enregistrement sans contenu dans `usage/token-usage-YYYY-MM.jsonl` sous le répertoire d’exécution. Cela permet l’agrégation quotidienne/mensuelle sans ajouter SQLite comme nouvelle dépendance.

3. **Garder les sémantiques de chronométrage de #4252 séparées.**
   Les résumés d’utilisation des tokens peuvent inclure `apiDurationMs`, qui correspond à la durée de réponse API de bout en bout existante de la télémétrie. Ce champ est délibérément nommé comme durée API et ne doit pas être présenté comme durée de génération, TTFT ou TPS. #4252 reste le propriétaire des métriques de chronométrage de génération.

4. **Maintenir les limites de confidentialité et de diagnostic mémoire de #4182.**
   Les enregistrements d’utilisation stockent uniquement des compteurs agrégés et des dimensions stables : date locale, mois, identifiant de session, modèle, type d’authentification, source, compteurs de tokens et durée API. Ils ne stockent ni texte de requête, ni texte de réponse, ni contenu d’outil, ni chemins de projet, ni identifiants de requête ou de réponse.

5. **L’export reste uniquement agrégé.**
   Les exports CSV et JSON sont des résumés, pas des transcriptions brutes. Ils regroupent par total, modèle, type d’authentification, modèle/type d’authentification, et source.

## Objectifs non visés

- Ne pas implémenter ici l’instrumentation TTFT/TPS/durée de génération de #4252.
- Ne pas étendre `/doctor memory` ni implémenter #4182 dans cette modification.
- Ne pas ajouter une commande oblique spécifique à l’utilisation des tokens.
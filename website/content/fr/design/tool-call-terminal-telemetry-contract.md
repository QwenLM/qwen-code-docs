# Contrat de télémétrie terminal des appels d'outil

## Problème

Les événements terminaux des appels d'outil sont produits à la fois par le
planificateur Core et ACP. Ils exposent déjà `status`, `success`, `error` et
`error_type`, mais ces champs peuvent diverger ou être absents. En
particulier, un outil peut renvoyer une erreur douce sans type d'erreur, et
ACP peut appeler le logger de télémétrie sans construire un `ToolCallEvent`.

Cela laisse les logs, les statistiques d'utilisation, les métriques, les
hooks et l'enregistrement du chat avec des vues différentes du même résultat
terminal.

## Périmètre de PR1

PR1 établit un contrat runtime à deux frontières :

1. Le planificateur Core convertit un `ToolResult.error` non classé en
   `ToolErrorType.UNKNOWN` avant de construire un appel terminé.
2. `logToolCall` normalise chaque événement avant de l'envoyer à tout
   consommateur de télémétrie.

Le contrat terminal est :

| `status`    | `success` | `error`   | `error_type`                |
| ----------- | --------- | --------- | --------------------------- |
| `success`   | `true`    | absent    | absent                      |
| `error`     | `false`   | préservé  | valeur explicite ou `unknown` |
| `cancelled` | `false`   | absent    | absent                      |

`status` fait autorité. Un `function_name` vide devient `unknown_tool`. Les
noms d'outil non vides et les types d'erreur non vides sont préservés tels
quels. Le normalisateur renvoie une copie et est idempotent.

La frontière Core est intentionnellement privée. Les implémentations
d'outils publiques peuvent continuer d'omettre `ToolResult.error.type`, et
`ToolCallResponseInfo.errorType` reste optionnel car les appels réussis et
annulés n'ont pas de classification d'erreur.

## Consommateurs

L'événement normalisé est utilisé par la télémétrie UI, l'événement UI
enregistré dans le chat, QwenLogger, les logs OpenTelemetry et les métriques
d'appels d'outil. Les alias OpenTelemetry `error.message` et `error.type`
sont renseignés indépendamment.

Le compteur d'appels d'outil ajoute l'attribut à faible cardinalité `status`
tout en conservant `success`. L'entrée publique `recordToolCallMetrics`
accepte un status optionnel pour la compatibilité des sources ; les appelants
qui l'omettent sont mappés depuis le booléen de succès legacy. L'histogramme
de latence reste indexé uniquement par `function_name`, et `error_type`
n'est pas ajouté aux métriques.

QwenLogger reçoit `status` et `tool_type`. Il ne reçoit ni
`mcp_server_name`, ni les arguments de fonction, ni les résultats, ni les
traces de pile dans le cadre de ce changement.

## Compatibilité et suites

Ce changement est additif pour les logs et les métriques, mais il fait passer
une erreur Core non classée d'une valeur manquante à `unknown` dans
PostToolBatch et l'enregistrement du chat Core. Les requêtes historiques
doivent fusionner les types d'erreur manquants en `unknown` ; aucun
backfill de données n'est requis.

Les points suivants restent hors de PR1 :

- corriger l'annulation de permission ACP et les autres bugs de statut
  terminal côté producteur ;
- normaliser l'enregistrement brut distinct `tool_result` d'ACP ;
- ajouter `error_type` au contrat du hook PostToolUseFailure ;
- ajouter la classification d'erreur aux spans d'outil primaires ;
- classifier les sites d'erreur individuels intégrés et MCP ;
- modifier la sémantique `totalFail` de l'UI legacy.

La nouvelle métrique `status` ne doit pas devenir la source du SLO de
stabilité tant que les corrections de statut terminal d'ACP ne sont pas
livrées.

## Vérifications de déploiement

Pour la nouvelle version du service, les opérateurs doivent vérifier que :

- les logs d'appels d'outil en erreur n'ont jamais d'`error_type` vide ;
- les logs d'appels d'outil n'ont jamais de `function_name` vide ;
- les événements success et cancelled ne portent pas de champs d'erreur ;
- les erreurs explicitement classées conservent leur type précédent ;
- le total du compteur d'appels d'outil reste aligné avec le volume des logs
  d'appels d'outil ; et
- l'augmentation d'`unknown` correspond au compartiment manquant précédent.

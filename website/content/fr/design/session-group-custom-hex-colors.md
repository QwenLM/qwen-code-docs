# Couleurs Hex personnalisées pour les groupes de sessions nommés

## Problème

Les groupes de sessions nommés partagent actuellement l'enum de couleurs à six
valeurs utilisée par les étiquettes de couleur rapides de session. Le démon
rejette toute autre valeur avec `invalid_group_color`, le SDK TypeScript
expose la même union fermée, et l'éditeur WebShell ne propose qu'un select
prédéfini. Les utilisateurs ne peuvent pas aligner les groupes nommés sur la
palette d'un projet existant ni distinguer visuellement un catalogue de
groupes plus large.

Suivi par [#6744](https://github.com/QwenLM/qwen-code/issues/6744).

## Changements proposés

| Couche         | Changement                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core           | Séparer les couleurs prédéfinies des tags de session des couleurs d'affichage des groupes nommés. Les groupes nommés acceptent les préréglages ou un `#RRGGBB` à six chiffres ; les tags rapides restent limités aux préréglages. Normaliser les valeurs Hex valides en minuscules avant persistance. |
| REST et ACP    | Conserver la validation des tags rapides sur les seuls préréglages et transmettre les couleurs des groupes nommés à la validation du core.                                                                       |
| SDK TypeScript | Exporter les types de couleurs prédéfinies et Hex. L'entrée/sortie des groupes utilise leur union ; l'organisation des sessions continue d'utiliser les couleurs prédéfinies.                                   |
| WebShell       | Conserver les choix prédéfinis et ajouter une option Custom avec un color picker natif et un champ texte Hex. Rendre les pastilles des groupes personnalisés avec une couleur de fond inline.                     |

## Décisions

- Accepter uniquement le format `#RRGGBB` à six chiffres. Les formes à trois,
  quatre et huit chiffres sont rejetées afin que toute valeur persistée ait
  une forme prévisible unique.
- Supprimer les espaces environnants et canonicaliser les valeurs Hex en
  minuscules dans le core. Les clients peuvent normaliser plus tôt pour un
  feedback immédiat, mais le core reste l'autorité.
- Ne pas étendre les étiquettes de couleur rapides de session. Leur catalogue
  à six valeurs reste une dimension d'ordre/filtrage compacte et demeure
  rétrocompatible.
- Conserver la version 1 du schéma sidecar. Le champ stocké reste une chaîne
  et les anciennes valeurs prédéfinies restent valides.
- Les clients existants qui ne reconnaissent pas une classe Hex doivent
  échouer proprement. Le WebShell rend les pastilles de groupes Hex via une
  `background-color` inline.

## Fichiers

- `packages/core/src/services/session-organization-service.ts`
- `packages/core/src/services/session-organization-service.test.ts`
- `packages/cli/src/serve/routes/session.ts`
- `packages/cli/src/serve/acp-http/dispatch.ts`
- `packages/cli/src/serve/server/session-list.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- `packages/sdk-typescript/src/daemon/index.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`
- `packages/web-shell/client/components/SessionOverviewPanel.tsx`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.test.tsx`
- `packages/web-shell/client/i18n.tsx`

## Hors périmètre

- Les couleurs personnalisées pour les tags rapides de session.
- Les canaux alpha, dégradés, couleurs CSS nommées ou formes Hex courtes.
- La modification du format du sidecar de groupe ou la migration des valeurs
  existantes.

## Questions ouvertes

Aucune. Les chemins existants d'erreur structurée et de persistance des
groupes peuvent être étendus sans incrément de version du protocole.

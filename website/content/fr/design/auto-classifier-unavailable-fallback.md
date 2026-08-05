# Fallback en cas d'indisponibilité du classifieur automatique

## Problème

Le mode Auto convertit actuellement chaque échec d'infrastructure du classifieur en refus d'exécution. Une erreur réseau, un timeout, une réponse structurée invalide, un modèle rapide indisponible ou un débordement de contexte fait donc échouer l'appel d'outil en attente avant que le flux de confirmation standard ne puisse demander à l'utilisateur quoi faire.

Ce comportement confond deux résultats différents :

- Un blocage de politique du classifieur est un verdict de sécurité et doit continuer à refuser l'action.
- Un résultat d'indisponibilité du classifieur signifie qu'aucun verdict n'a été produit et doit laisser l'utilisateur prendre la décision manuellement.

Le fallback existant aux indisponibilités consécutives n'ouvre une confirmation qu'après deux appels de classifieur en échec. Les premiers échecs terminent toujours leurs appels d'outils, et le prompt n'explique pas le problème d'infrastructure ni n'offre de chemin de récupération direct.

## Objectifs

- Router le premier résultat d'indisponibilité du classifieur vers le flux de confirmation manuelle standard.
- Expliquer dans la confirmation que le mode Auto n'a pas pu classifier l'action.
- Offrir une option explicite qui approuve l'action courante une fois et bascule la session vers le mode Default.
- Garder le comportement de permissions du CLI et d'ACP aligné.
- Préserver les blocages de politique, les règles de refus explicites, les gardes déterministes de commandes destructives et le comportement d'annulation utilisateur.

## Non-objectifs

- Persister le mode Default dans les paramètres utilisateur ou workspace.
- Basculer automatiquement de mode sans sélection utilisateur.
- Modifier les règles allow/block du classifieur de politique.
- Rendre les sessions non interactives ou en arrière-plan capables de présenter un prompt lorsqu'elles n'ont pas de surface d'approbation.

## Comportement proposé

Lorsque le classifieur renvoie `unavailable: true`, la couche de permissions enregistrera toujours l'événement d'indisponibilité, mais elle renverra un résultat de fallback manuel au lieu d'un résultat bloqué. L'appel en attente continuera à travers les chemins PermissionRequest et de confirmation existants.

La confirmation générée portera des métadonnées de fallback du mode Auto et supprimera les choix persistants « toujours autoriser ». La confirmation indiquera que le classifieur est indisponible et recommandera le mode Default si les échecs persistent. Ses choix incluront :

- Autoriser une fois.
- Basculer vers le mode Default et autoriser une fois.
- Rejeter.

Le choix de bascule est intentionnellement combiné avec une approbation explicite unique. Un libellé portant uniquement sur le mode laisserait le sort de l'action déjà en attente ambigu.

| Résultat du classifieur | Comportement actuel                        | Nouveau comportement           |
| ----------------------- | ------------------------------------------ | ------------------------------ |
| Allow                   | Exécution automatique                      | Inchangé                       |
| Blocage de politique    | Refus avec la raison de politique          | Inchangé                       |
| Unavailable             | Refus de l'appel d'outil                   | Demande d'approbation manuelle |

## Flux de permissions principal

`applyAutoModeDecision` enregistrera les compteurs d'indisponibilité et renverra une raison de fallback dédiée à l'indisponibilité du classifieur. Comme le résultat n'est plus bloqué, les hooks PermissionDenied ne se déclencheront pas pour les échecs d'infrastructure ; le hook PermissionRequest normal s'exécutera à la place avant le prompt.

Les compteurs d'indisponibilité restent utiles. Approuver un fallback réinitialise les compteurs consécutifs, tandis que le rejeter les préserve. Si des échecs répétés atteignent le seuil existant, les appels ultérieurs éligibles au classifieur peuvent contourner le classifieur notoirement cassé et aller directement à la confirmation manuelle.

Les détails de confirmation gagneront des métadonnées optionnelles de fallback du mode Auto partagées entre les formes de confirmation edit, execute, info, MCP et autres. Un nouveau résultat d'approbation représentera « procéder une fois et basculer vers Default ». Le planificateur CLI basculera le mode de session du runtime et normalisera ce résultat en `ProceedOnce` ordinaire avant d'invoquer les callbacks de confirmation spécifiques à l'outil ou d'enregistrer la décision de l'outil.

`Config.setApprovalMode` fournit déjà la transition de session requise : il restaure les règles temporairement retirées à l'entrée en mode Auto, réinitialise les compteurs de refus et incrémente la révision du mode d'approbation. Aucun fichier de paramètres n'est modifié.

## Présentation CLI

Le composant de confirmation du TUI affichera l'avis de fallback avant les détails de l'action et ajoutera l'option de bascule avant Rejeter. Les mises en page de confirmation complète et compacte exposeront toutes deux l'option. Le calcul de hauteur doit réserver de l'espace pour l'avertissement et l'option ajoutés afin que les petits terminaux continuent d'afficher des choix exploitables.

## Présentation ACP

Les requêtes de permission ACP incluront l'avis de fallback comme contenu texte et exposeront la même option basculer-et-autoriser-une-fois. Lorsqu'elle est sélectionnée, la session normalisera l'approbation de l'outil en `ProceedOnce`, basculera le mode du runtime vers Default et publiera la notification de mise à jour du mode courant existante.

Les clients ACP qui ne choisissent que Allow ou Reject continuent d'utiliser le comportement existant du protocole.

## Frontières d'échec

- L'annulation par l'utilisateur de la requête du classifieur reste un abandon et ne devient pas un prompt d'approbation.
- Les refus de permission explicites et les blocages déterministes de commandes destructives restent des erreurs.
- Les appels non interactifs sans transport de permission et les agents en arrière-plan qui ne peuvent pas présenter de prompt refusent toujours via leur gestion de fallback de confirmation manuelle existante.
- Une revue de politique en échec dans l'étape 2 du classifieur est considérée comme indisponible et demande donc à l'utilisateur ; un blocage de politique de l'étape 2 terminé reste refusé.

## Fichiers affectés

- `packages/core/src/permissions/autoMode.ts` et tests : mapping indisponibilité-vers-fallback, métadonnées et gating des hooks.
- `packages/core/src/tools/tools.ts` : métadonnées de confirmation du fallback et résultat d'approbation de bascule.
- `packages/core/src/core/coreToolScheduler.ts` et tests : décoration des confirmations, suivi de la résolution du fallback, bascule de mode et normalisation de l'approbation.
- `packages/core/src/telemetry/tool-call-decision.ts` et tests : classification du nouveau résultat en forme d'approbation.
- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` et tests : rendu de l'avis et de l'option.
- `packages/cli/src/acp-integration/session/permissionUtils.ts` et tests : contenu ACP et mapping des options.
- `packages/cli/src/acp-integration/session/Session.ts` et tests : fallback ACP, transition de mode et notification.
- `docs/users/features/auto-mode.md` : documenter le fallback manuel immédiat et l'option de récupération du mode Default.

## Questions ouvertes

Aucune. La bascule est limitée à la session et approuve explicitement l'action en attente une fois.

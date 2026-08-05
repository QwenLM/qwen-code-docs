# Suggestions d'intention du composer de Web Shell

## Résumé

Étendre la suggestion de nouveau sujet existante de Web Shell afin qu'une
classification prudente puisse recommander soit de poser une question annexe
avec `/btw`, soit d'envoyer un nouveau sujet substantiel dans une nouvelle
session.

Le composer continue d'afficher au plus une action non bloquante. Une décision
`none` valide ne rend rien. Les classifications invalides, échouées ou
annulées ne rendent rien non plus.

## Contrat de décision

```ts
type SuggestionKind = 'btw' | 'new_session' | 'none';

interface SuggestionDecision {
  suggestion: SuggestionKind;
  confidence: number;
}
```

Seules les décisions `btw` et `new_session` au-dessus ou au niveau du seuil de
confiance existant deviennent actionnables. L'état actionnable enregistre le
brouillon classifié exact et la session source afin que les deux puissent être
revérifiés quand l'utilisateur clique.

## Comportement

- `btw` est pour une question annexe rapide et autonome qui ne doit pas
  perturber la tâche principale.
- `new_session` est pour une tâche ou un sujet substantiel et clairement
  différent.
- `none` couvre les continuations, les incertitudes et les brouillons qui ne
  correspondent à aucune des deux actions.
- La classification BTW commence après un échange utilisateur/assistant
  antérieur. Les suggestions de nouvelle session conservent leurs seuils de
  contexte existants plus stricts.
- Une formulation ressemblant à un suivi peut être classifiée pour BTW, mais
  ne peut jamais utiliser le seuil BTW assoupli pour faire apparaître une
  action de nouvelle session.
- Cliquer sur une suggestion `btw` soumet `/btw <draft>` via le chemin
  d'éditeur existant, ce qui préserve l'historique actuel de la commande et la
  sémantique d'effacement du composer.
- Un brouillon avec une image ou un tag de composer n'est jamais éligible à
  `btw`.
- `new_session` conserve la séquence existante d'effacement, détachement,
  création et soumission automatique, y compris la préservation des images et
  l'annulation des races de session.

## Sécurité

Le classifieur reste prudent et fail closed (refus en cas d'échec) :

- une sortie malformée, des actions inconnues, une confiance invalide, des
  erreurs et une annulation ne produisent aucune action ;
- un changement de session abandonne la classification en attente et invalide
  une suggestion visible ;
- un changement de brouillon ou de pièce jointe invalide une suggestion
  visible ;
- le traitement du clic vérifie le brouillon actuel, la session source et
  l'état des pièces jointes immédiatement avant l'exécution ;
- les pièces jointes sont considérées comme présentes jusqu'à ce que
  ChatEditor indique le contraire, de sorte qu'un état transitoirement inconnu
  ne puisse pas exposer une action `/btw`.

## Périmètre

Le changement reste à l'intérieur de Web Shell. Il réutilise la génération de
session du démon existante, la soumission de l'éditeur et le comportement de
`/btw`. Il n'ajoute pas de routes du démon ou du SDK, ne modifie pas le style
et n'introduit pas de framework de suggestions généraliste.

## Performance du composer

Les changements de brouillon entrent dans le classifieur via un callback
stable. Ils mettent à jour les refs, l'état d'annulation et le timer de
debounce du classifieur sans mettre à jour l'état React. L'application Web
Shell ne se re-rend que lorsqu'une suggestion actionnable apparaît ou qu'une
suggestion existante est invalidée.

Cela garde la classification d'intention hors du chemin de rendu du composer
tout en préservant une annulation immédiate quand le brouillon change.

## Stratégie de test

- Les tests de hook couvrent les trois valeurs de décision, le parsing strict,
  la confiance, le gating des pièces jointes et les résultats de session
  obsolète.
- Les tests d'App couvrent l'exécution de `/btw` et l'effacement du composer,
  le rejet des brouillons/sessions obsolètes, le rejet des pièces jointes, les
  races de nouvelle session existantes et l'absence de re-render d'App pendant
  qu'une classification est en attente.
- Les tests de ChatEditor couvrent le rapport de présence des pièces jointes.

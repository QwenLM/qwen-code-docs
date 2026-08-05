# Retry de soumission d'AskUserQuestion dans Web Shell

## Problème

`AskUserQuestion` se verrouille immédiatement après qu'une décision est
cliquée, mais son callback n'expose pas le résultat asynchrone de la
permission. Une requête échouée laisse donc un panneau d'apparence activée qui
ignore silencieusement les retries. Le chemin de soumission retourne aussi
silencieusement quand le payload de permission n'a pas d'option `allow_once`.

## Design

- Donner à `AskUserQuestion` un callback de confirmation retournant une
  promesse et un rapporteur d'erreur fourni par la surface de chat qui le
  possède.
- Pendant que la requête est en cours, désactiver les actions et afficher un
  indicateur de soumission.
- Garder une décision acceptée avec succès verrouillée pendant que
  l'événement de permission supprime le panneau. Cela couvre aussi les votes
  de consensus enregistrés mais pas encore définitifs.
- En cas de rejet ou de résultat `false`, rapporter l'erreur et déverrouiller
  les actions afin que l'utilisateur puisse retenter.
- Rapporter immédiatement une option `allow_once` manquante au lieu de
  retourner silencieusement.

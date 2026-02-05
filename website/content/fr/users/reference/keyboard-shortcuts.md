# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci                      | Description                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Échap`                        | Ferme les dialogues et les suggestions.                                                                               |
| `Ctrl+C`                       | Annule la requête en cours et efface l'entrée. Appuyez deux fois pour quitter l'application.                          |
| `Ctrl+D`                       | Quitte l'application si l'entrée est vide. Appuyez deux fois pour confirmer.                                          |
| `Ctrl+L`                       | Efface l'écran.                                                                                                       |
| `Ctrl+O`                       | Bascule l'affichage de la console de débogage.                                                                        |
| `Ctrl+S`                       | Permet l'affichage complet des réponses longues, en désactivant le troncage. Utilisez le défilement de votre terminal pour voir la sortie complète. |
| `Ctrl+T`                       | Bascule l'affichage des descriptions des outils.                                                                      |
| `Maj+Tab` (`Tab` sur Windows)  | Parcourt les modes d'approbation (`plan` → `default` → `auto-edit` → `yolo`)                                         |

## Invite de saisie

| Raccourci                                          | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Bascule en mode shell lorsque la saisie est vide.                                                                                   |
| `?`                                                | Bascule l'affichage des raccourcis clavier lorsque la saisie est vide.                                                              |
| `\` (à la fin de la ligne) + `Entrée`              | Insère une nouvelle ligne.                                                                                                          |
| `Flèche bas`                                       | Navigue vers le bas dans l'historique de saisie.                                                                                    |
| `Entrée`                                           | Soumet l'invite actuelle.                                                                                                           |
| `Meta+Suppr` / `Ctrl+Suppr`                        | Supprime le mot à droite du curseur.                                                                                                |
| `Tab`                                              | Complète automatiquement la suggestion actuelle s'il en existe une.                                                                 |
| `Flèche haut`                                      | Navigue vers le haut dans l'historique de saisie.                                                                                   |
| `Ctrl+A` / `Début`                                 | Déplace le curseur au début de la ligne.                                                                                            |
| `Ctrl+B` / `Flèche gauche`                         | Déplace le curseur d'un caractère vers la gauche.                                                                                   |
| `Ctrl+C`                                           | Efface l'invite de saisie                                                                                                           |
| `Échap` (double pression)                          | Efface l'invite de saisie.                                                                                                          |
| `Ctrl+D` / `Suppr`                                 | Supprime le caractère à droite du curseur.                                                                                          |
| `Ctrl+E` / `Fin`                                   | Déplace le curseur à la fin de la ligne.                                                                                            |
| `Ctrl+F` / `Flèche droite`                         | Déplace le curseur d'un caractère vers la droite.                                                                                   |
| `Ctrl+H` / `Retour arrière`                        | Supprime le caractère à gauche du curseur.                                                                                          |
| `Ctrl+K`                                           | Supprime depuis le curseur jusqu'à la fin de la ligne.                                                                              |
| `Ctrl+Flèche gauche` / `Meta+Flèche gauche` / `Meta+B` | Déplace le curseur d'un mot vers la gauche.                                                                                   |
| `Ctrl+N`                                           | Navigue vers le bas dans l'historique de saisie.                                                                                    |
| `Ctrl+P`                                           | Navigue vers le haut dans l'historique de saisie.                                                                                   |
| `Ctrl+R`                                           | Recherche inversée dans l'historique de saisie/mode shell.                                                                          |
| `Ctrl+Flèche droite` / `Meta+Flèche droite` / `Meta+F` | Déplace le curseur d'un mot vers la droite.                                                                                 |
| `Ctrl+U`                                           | Supprime depuis le curseur jusqu'au début de la ligne.                                                                              |
| `Ctrl+V`                                           | Colle le contenu du presse-papiers. Si le presse-papiers contient une image, elle sera sauvegardée et une référence y sera insérée dans l'invite. |
| `Ctrl+W` / `Meta+Retour arrière` / `Ctrl+Retour arrière` | Supprime le mot à gauche du curseur.                                                                                        |
| `Ctrl+X` / `Meta+Entrée`                           | Ouvre la saisie actuelle dans un éditeur externe.                                                                                   |

## Suggestions

| Raccourci       | Description                                |
| --------------- | ------------------------------------------ |
| `Flèche bas`    | Naviguer vers le bas dans les suggestions. |
| `Tab` / `Entrée`| Accepter la suggestion sélectionnée.       |
| `Flèche haut`   | Naviguer vers le haut dans les suggestions.|

## Sélection par bouton radio

| Raccourci          | Description                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Flèche bas` / `j` | Déplacer la sélection vers le bas.                                                                              |
| `Entrée`           | Confirmer la sélection.                                                                                         |
| `Flèche haut` / `k`| Déplacer la sélection vers le haut.                                                                             |
| `1-9`              | Sélectionner un élément par son numéro.                                                                         |
| (multi-chiffres)   | Pour les éléments dont le numéro est supérieur à 9, appuyez rapidement sur les chiffres pour sélectionner l'élément correspondant. |

## Intégration IDE

| Raccourci | Description                                        |
| --------- | -------------------------------------------------- |
| `Ctrl+G`  | Voir le contexte CLI reçu depuis l'IDE             |
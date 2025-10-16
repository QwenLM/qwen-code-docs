# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci   | Description                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`       | Fermer les boîtes de dialogue et les suggestions.                                                                     |
| `Ctrl+C`    | Annuler la requête en cours et effacer l'entrée. Appuyez deux fois pour quitter l'application.                        |
| `Ctrl+D`    | Quitter l'application si l'entrée est vide. Appuyez deux fois pour confirmer.                                         |
| `Ctrl+L`    | Effacer l'écran.                                                                                                      |
| `Ctrl+O`    | Activer/désactiver l'affichage de la console de débogage.                                                             |
| `Ctrl+S`    | Permet aux réponses longues de s'afficher entièrement, en désactivant la troncature. Utilisez le défilement de votre terminal pour voir la sortie complète. |
| `Ctrl+T`    | Activer/désactiver l'affichage des descriptions des outils.                                                           |
| `Shift+Tab` | Parcourir les modes d'approbation (`plan` → `default` → `auto-edit` → `yolo`).                                        |

## Input Prompt

| Raccourci                                          | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Basculer en mode shell lorsque l'entrée est vide.                                                                                   |
| `\` (en fin de ligne) + `Enter`                    | Insérer un saut de ligne.                                                                                                           |
| `Flèche bas`                                       | Naviguer vers le bas dans l'historique des entrées.                                                                                 |
| `Enter`                                            | Soumettre l'invite actuelle.                                                                                                        |
| `Meta+Delete` / `Ctrl+Delete`                      | Supprimer le mot à droite du curseur.                                                                                               |
| `Tab`                                              | Compléter automatiquement la suggestion actuelle si elle existe.                                                                    |
| `Flèche haut`                                      | Naviguer vers le haut dans l'historique des entrées.                                                                                |
| `Ctrl+A` / `Home`                                  | Déplacer le curseur au début de la ligne.                                                                                           |
| `Ctrl+B` / `Flèche gauche`                         | Déplacer le curseur d'un caractère vers la gauche.                                                                                  |
| `Ctrl+C`                                           | Effacer l'invite d'entrée.                                                                                                          |
| `Esc` (appui double)                               | Effacer l'invite d'entrée.                                                                                                          |
| `Ctrl+D` / `Delete`                                | Supprimer le caractère à droite du curseur.                                                                                         |
| `Ctrl+E` / `End`                                   | Déplacer le curseur à la fin de la ligne.                                                                                           |
| `Ctrl+F` / `Flèche droite`                         | Déplacer le curseur d'un caractère vers la droite.                                                                                  |
| `Ctrl+H` / `Backspace`                             | Supprimer le caractère à gauche du curseur.                                                                                         |
| `Ctrl+K`                                           | Supprimer du curseur jusqu'à la fin de la ligne.                                                                                    |
| `Ctrl+Flèche gauche` / `Meta+Flèche gauche` / `Meta+B` | Déplacer le curseur d'un mot vers la gauche.                                                                                        |
| `Ctrl+N`                                           | Naviguer vers le bas dans l'historique des entrées.                                                                                 |
| `Ctrl+P`                                           | Naviguer vers le haut dans l'historique des entrées.                                                                                |
| `Ctrl+Flèche droite` / `Meta+Flèche droite` / `Meta+F` | Déplacer le curseur d'un mot vers la droite.                                                                                        |
| `Ctrl+U`                                           | Supprimer du curseur jusqu'au début de la ligne.                                                                                    |
| `Ctrl+V`                                           | Coller le contenu du presse-papiers. Si le presse-papiers contient une image, elle sera sauvegardée et une référence sera insérée dans l'invite. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Supprimer le mot à gauche du curseur.                                                                                               |
| `Ctrl+X` / `Meta+Enter`                            | Ouvrir l'entrée actuelle dans un éditeur externe.                                                                                   |

## Suggestions

| Raccourci       | Description                           |
| --------------- | ------------------------------------- |
| `Down Arrow`    | Naviguer vers le bas dans les suggestions. |
| `Tab` / `Enter` | Accepter la suggestion sélectionnée.  |
| `Up Arrow`      | Naviguer vers le haut dans les suggestions. |

## Sélection par bouton radio

| Raccourci          | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Déplacer la sélection vers le bas.                                                                            |
| `Enter`            | Confirmer la sélection.                                                                                       |
| `Up Arrow` / `k`   | Déplacer la sélection vers le haut.                                                                           |
| `1-9`              | Sélectionner un élément par son numéro.                                                                       |
| (multi-chiffres)   | Pour les éléments avec des numéros supérieurs à 9, appuyez rapidement sur les chiffres pour sélectionner l'élément correspondant. |

## Intégration IDE

| Raccourci | Description                          |
| --------- | ------------------------------------ |
| `Ctrl+G`  | Voir le contexte CLI reçu de l'IDE   |
# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci   | Description                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`       | Fermer les boîtes de dialogue et les suggestions.                                                                     |
| `Ctrl+C`    | Annuler la requête en cours et effacer l'entrée. Appuyer deux fois pour quitter l'application.                        |
| `Ctrl+D`    | Quitter l'application si l'entrée est vide. Appuyer deux fois pour confirmer.                                         |
| `Ctrl+L`    | Effacer l'écran.                                                                                                      |
| `Ctrl+O`    | Basculer l'affichage de la console de débogage.                                                                       |
| `Ctrl+S`    | Permet aux réponses longues de s'afficher entièrement, désactivant la troncature. Utilisez le défilement de votre terminal pour voir la sortie complète. |
| `Ctrl+T`    | Basculer l'affichage des descriptions des outils.                                                                     |
| `Shift+Tab` | Parcourir les modes d'approbation (`plan` → `default` → `auto-edit` → `yolo`).                                        |

## Invite de saisie

| Raccourci                                          | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Basculer en mode shell lorsque l'invite est vide.                                                                                   |
| `\` (à la fin de la ligne) + `Entrée`              | Insérer un saut de ligne.                                                                                                           |
| `Flèche bas`                                       | Naviguer vers le bas dans l'historique des saisies.                                                                                 |
| `Entrée`                                           | Soumettre l'invite actuelle.                                                                                                        |
| `Méta+Suppr` / `Ctrl+Suppr`                        | Supprimer le mot à droite du curseur.                                                                                               |
| `Tabulation`                                       | Compléter automatiquement la suggestion actuelle si elle existe.                                                                    |
| `Flèche haut`                                      | Naviguer vers le haut dans l'historique des saisies.                                                                                |
| `Ctrl+A` / `Début`                                 | Déplacer le curseur au début de la ligne.                                                                                           |
| `Ctrl+B` / `Flèche gauche`                         | Déplacer le curseur d'un caractère vers la gauche.                                                                                  |
| `Ctrl+C`                                           | Effacer l'invite de saisie.                                                                                                         |
| `Échap` (appui double)                             | Effacer l'invite de saisie.                                                                                                         |
| `Ctrl+D` / `Suppr`                                 | Supprimer le caractère à droite du curseur.                                                                                         |
| `Ctrl+E` / `Fin`                                   | Déplacer le curseur à la fin de la ligne.                                                                                           |
| `Ctrl+F` / `Flèche droite`                         | Déplacer le curseur d'un caractère vers la droite.                                                                                  |
| `Ctrl+H` / `Retour arrière`                        | Supprimer le caractère à gauche du curseur.                                                                                         |
| `Ctrl+K`                                           | Supprimer depuis le curseur jusqu'à la fin de la ligne.                                                                             |
| `Ctrl+Flèche gauche` / `Méta+Flèche gauche` / `Méta+B` | Déplacer le curseur d'un mot vers la gauche.                                                                                        |
| `Ctrl+N`                                           | Naviguer vers le bas dans l'historique des saisies.                                                                                 |
| `Ctrl+P`                                           | Naviguer vers le haut dans l'historique des saisies.                                                                                |
| `Ctrl+Flèche droite` / `Méta+Flèche droite` / `Méta+F` | Déplacer le curseur d'un mot vers la droite.                                                                                        |
| `Ctrl+U`                                           | Supprimer depuis le curseur jusqu'au début de la ligne.                                                                             |
| `Ctrl+V`                                           | Coller le contenu du presse-papiers. Si le presse-papiers contient une image, celle-ci sera enregistrée et une référence sera insérée dans l'invite. |
| `Ctrl+W` / `Méta+Retour arrière` / `Ctrl+Retour arrière` | Supprimer le mot à gauche du curseur.                                                                                               |
| `Ctrl+X` / `Méta+Entrée`                           | Ouvrir la saisie actuelle dans un éditeur externe.                                                                                  |

## Suggestions

| Raccourci       | Description                              |
| --------------- | ---------------------------------------- |
| `Flèche bas`    | Naviguer vers le bas dans les suggestions. |
| `Tab` / `Entrée`| Accepter la suggestion sélectionnée.      |
| `Flèche haut`   | Naviguer vers le haut dans les suggestions.|

## Sélection par bouton radio

| Raccourci          | Description                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Flèche bas` / `j` | Déplacer la sélection vers le bas.                                                                               |
| `Entrée`           | Confirmer la sélection.                                                                                          |
| `Flèche haut` / `k`| Déplacer la sélection vers le haut.                                                                              |
| `1-9`              | Sélectionner un élément par son numéro.                                                                          |
| (multi-chiffres)   | Pour les éléments avec des numéros supérieurs à 9, appuyez rapidement sur les chiffres pour sélectionner l'élément correspondant. |

## Intégration IDE

| Raccourci | Description                          |
| --------- | ------------------------------------ |
| `Ctrl+G`  | Voir le contexte CLI reçu de l'IDE   |
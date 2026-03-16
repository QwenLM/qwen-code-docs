# Raccourcis clavier de Qwen Code

Ce document répertorie les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci                        | Description                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Échap`                          | Ferme les boîtes de dialogue et les suggestions.                                                                      |
| `Ctrl+C`                         | Annule la requête en cours et efface la saisie. Appuyez deux fois pour quitter l’application.                         |
| `Ctrl+D`                         | Quitte l’application si la saisie est vide. Appuyez deux fois pour confirmer.                                         |
| `Ctrl+L`                         | Efface l’écran.                                                                                                       |
| `Ctrl+O`                         | Active/désactive l’affichage de la console de débogage.                                                               |
| `Ctrl+S`                         | Permet aux réponses longues d’être entièrement affichées, en désactivant la troncature. Utilisez la mémoire tampon de défilement de votre terminal pour consulter la sortie complète. |
| `Ctrl+T`                         | Active/désactive l’affichage des descriptions des outils.                                                             |
| `Maj+Tab` (`Tab` sous Windows)   | Bascule entre les modes d’approbation (`plan` → `default` → `auto-edit` → `yolo`)                                      |

## Invite d’entrée

| Raccourci                                          | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Active/désactive le mode shell lorsque l’invite est vide.                                                                           |
| `?`                                                | Active/désactive l’affichage des raccourcis clavier lorsque l’invite est vide.                                                      |
| `\` (en fin de ligne) + `Entrée`                   | Insère un saut de ligne.                                                                                                            |
| `Flèche vers le bas`                               | Parcourt l’historique des entrées vers le bas.                                                                                      |
| `Entrée`                                           | Envoie l’invite actuelle.                                                                                                           |
| `Alt+Suppr` / `Ctrl+Suppr`                         | Supprime le mot situé à droite du curseur.                                                                                           |
| `Tab`                                              | Termine automatiquement l’invite en cours, si une suggestion existe.                                                                 |
| `Flèche vers le haut`                              | Parcourt l’historique des entrées vers le haut.                                                                                     |
| `Ctrl+A` / `Origine`                               | Déplace le curseur au début de la ligne.                                                                                            |
| `Ctrl+B` / `Flèche gauche`                         | Déplace le curseur d’un caractère vers la gauche.                                                                                    |
| `Ctrl+C`                                           | Efface l’invite d’entrée.                                                                                                           |
| `Échap` (deux fois)                                | Efface l’invite d’entrée.                                                                                                           |
| `Ctrl+D` / `Suppr`                                 | Supprime le caractère situé à droite du curseur.                                                                                    |
| `Ctrl+E` / `Fin`                                   | Déplace le curseur à la fin de la ligne.                                                                                            |
| `Ctrl+F` / `Flèche droite`                         | Déplace le curseur d’un caractère vers la droite.                                                                                   |
| `Ctrl+H` / `Retour arrière`                        | Supprime le caractère situé à gauche du curseur.                                                                                    |
| `Ctrl+K`                                           | Supprime tout ce qui se trouve entre le curseur et la fin de la ligne.                                                              |
| `Ctrl+Flèche gauche` / `Alt+Flèche gauche` / `Alt+B` | Déplace le curseur d’un mot vers la gauche.                                                                                         |
| `Ctrl+N`                                           | Parcourt l’historique des entrées vers le bas.                                                                                      |
| `Ctrl+P`                                           | Parcourt l’historique des entrées vers le haut.                                                                                     |
| `Ctrl+R`                                           | Effectue une recherche inversée dans l’historique des entrées ou du shell.                                                           |
| `Ctrl+Y`                                           | Réessaie la dernière requête ayant échoué.                                                                                          |
| `Ctrl+Flèche droite` / `Alt+Flèche droite` / `Alt+F` | Déplace le curseur d’un mot vers la droite.                                                                                         |
| `Ctrl+U`                                           | Supprime tout ce qui se trouve entre le curseur et le début de la ligne.                                                            |
| `Ctrl+V` (Windows : `Alt+V`)                       | Colle le contenu du presse-papiers. Si celui-ci contient une image, celle-ci est enregistrée et une référence est insérée dans l’invite. |
| `Ctrl+W` / `Alt+Retour arrière` / `Ctrl+Retour arrière` | Supprime le mot situé à gauche du curseur.                                                                                          |
| `Ctrl+X` / `Alt+Entrée`                            | Ouvre l’invite actuelle dans un éditeur externe.                                                                                    |

## Suggestions

| Raccourci       | Description                            |
| --------------- | -------------------------------------- |
| `Flèche vers le bas` | Parcourir les suggestions vers le bas. |
| `Tabulation` / `Entrée` | Accepter la suggestion sélectionnée.        |
| `Flèche vers le haut`   | Parcourir les suggestions vers le haut.   |

## Sélection par bouton radio

| Raccourci            | Description                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Flèche bas` / `j`    | Déplacer la sélection vers le bas.                                                                                   |
| `Entrée`              | Confirmer la sélection.                                                                                              |
| `Flèche haut` / `k`   | Déplacer la sélection vers le haut.                                                                                    |
| `1-9`                 | Sélectionner un élément par son numéro.                                                                               |
| (plusieurs chiffres)  | Pour les éléments dont le numéro dépasse 9, appuyez rapidement sur les chiffres correspondants pour les sélectionner. |

## Intégration à l’IDE

| Raccourci | Description                                  |
| --------- | -------------------------------------------- |
| `Ctrl+G`  | Afficher le contexte CLI reçu depuis l’IDE |
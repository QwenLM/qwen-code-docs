# Raccourcis clavier de Qwen Code

Ce document répertorie les raccourcis clavier disponibles dans Qwen Code.

## Général

| Shortcut                       | Description                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Fermer les boîtes de dialogue et les suggestions.                                                                     |
| `Ctrl+C`                       | Annuler la requête en cours et effacer la saisie. Appuyer deux fois pour quitter l'application.                       |
| `Ctrl+D`                       | Quitter l'application si la saisie est vide. Appuyer deux fois pour confirmer.                                        |
| `Ctrl+L`                       | Effacer l'écran.                                                                                                      |
| `Ctrl+O`                       | Basculer le mode compact (masquer/afficher la sortie des outils et la réflexion).                                     |
| `Ctrl+S`                       | Permet l'affichage complet des réponses longues en désactivant la troncature. Utilisez le défilement de votre terminal pour consulter l'intégralité de la sortie. |
| `Ctrl+T`                       | Basculer l'affichage des descriptions des outils.                                                                     |
| `Shift+Tab` (`Tab` sur Windows) | Parcourir les modes d'approbation (`plan` → `default` → `auto-edit` → `yolo`)                                         |

## Invite de saisie

| Shortcut                                           | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Basculer le mode shell lorsque la saisie est vide.                                                                                  |
| `?`                                                | Basculer l'affichage des raccourcis clavier lorsque la saisie est vide.                                                             |
| `\` (en fin de ligne) + `Enter`                    | Insérer un saut de ligne.                                                                                                           |
| `Down Arrow`                                       | Naviguer vers le bas dans l'historique de saisie.                                                                                   |
| `Enter`                                            | Envoyer l'invite actuelle.                                                                                                          |
| `Meta+Delete` / `Ctrl+Delete`                      | Supprimer le mot à droite du curseur.                                                                                               |
| `Tab`                                              | Autocompléter la suggestion actuelle si elle existe.                                                                                |
| `Up Arrow`                                         | Naviguer vers le haut dans l'historique de saisie.                                                                                  |
| `Ctrl+A` / `Home`                                  | Déplacer le curseur au début de la ligne.                                                                                           |
| `Ctrl+B` / `Left Arrow`                            | Déplacer le curseur d'un caractère vers la gauche.                                                                                  |
| `Ctrl+C`                                           | Effacer l'invite de saisie                                                                                                          |
| `Esc` (double appui)                               | Effacer l'invite de saisie.                                                                                                         |
| `Ctrl+D` / `Delete`                                | Supprimer le caractère à droite du curseur.                                                                                         |
| `Ctrl+E` / `End`                                   | Déplacer le curseur à la fin de la ligne.                                                                                           |
| `Ctrl+F` / `Right Arrow`                           | Déplacer le curseur d'un caractère vers la droite.                                                                                  |
| `Ctrl+H` / `Backspace`                             | Supprimer le caractère à gauche du curseur.                                                                                         |
| `Ctrl+K`                                           | Supprimer du curseur jusqu'à la fin de la ligne.                                                                                    |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`   | Déplacer le curseur d'un mot vers la gauche.                                                                                        |
| `Ctrl+N`                                           | Naviguer vers le bas dans l'historique de saisie.                                                                                   |
| `Ctrl+P`                                           | Naviguer vers le haut dans l'historique de saisie.                                                                                  |
| `Ctrl+R`                                           | Recherche inversée dans l'historique de saisie/shell.                                                                               |
| `Ctrl+Y`                                           | Relancer la dernière requête ayant échoué.                                                                                          |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F` | Déplacer le curseur d'un mot vers la droite.                                                                                        |
| `Ctrl+U`                                           | Supprimer du curseur jusqu'au début de la ligne.                                                                                    |
| `Ctrl+V` (Windows : `Alt+V`)                       | Coller le contenu du presse-papiers. Si le presse-papiers contient une image, celle-ci sera enregistrée et une référence y sera insérée dans l'invite. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Supprimer le mot à gauche du curseur.                                                                                               |
| `Ctrl+X` / `Meta+Enter`                            | Ouvrir la saisie actuelle dans un éditeur externe.                                                                                  |

## Suggestions

| Shortcut        | Description                            |
| --------------- | -------------------------------------- |
| `Down Arrow`    | Naviguer vers le bas dans les suggestions. |
| `Tab` / `Enter` | Accepter la suggestion sélectionnée.   |
| `Up Arrow`      | Naviguer vers le haut dans les suggestions. |

## Sélection par bouton radio

| Shortcut           | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Déplacer la sélection vers le bas.                                                                            |
| `Enter`            | Confirmer la sélection.                                                                                       |
| `Up Arrow` / `k`   | Déplacer la sélection vers le haut.                                                                           |
| `1-9`              | Sélectionner un élément par son numéro.                                                                       |
| (plusieurs chiffres) | Pour les éléments numérotés au-delà de 9, appuyez rapidement sur les chiffres successifs pour sélectionner l'élément correspondant. |

## Intégration IDE

| Shortcut | Description                       |
| -------- | --------------------------------- |
| `Ctrl+G` | Afficher le contexte CLI reçu de l'IDE |
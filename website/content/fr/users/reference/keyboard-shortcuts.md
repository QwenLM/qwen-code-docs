# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci                      | Description                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Fermer les dialogues et suggestions.                                                                                                                                                                                                                                                                           |
| `Ctrl+C`                       | Annuler la requête en cours et effacer l'entrée. Appuyez deux fois pour quitter l'application.                                                                                                                                                                                                                 |
| `Ctrl+D`                       | Quitter l'application si l'entrée est vide. Appuyez deux fois pour confirmer.                                                                                                                                                                                                                                  |
| `Ctrl+L`                       | Effacer l'écran.                                                                                                                                                                                                                                                                                               |
| `Ctrl+O`                       | Activer/désactiver le mode compact (masquer/afficher la sortie des outils et la réflexion).                                                                                                                                                                                                                    |
| `Ctrl+S`                       | Permet aux réponses longues de s'afficher complètement, en désactivant la troncature. Utilisez le défilement arrière de votre terminal pour voir la sortie entière.                                                                                                                                             |
| `Ctrl+T`                       | Activer/désactiver l'affichage des descriptions d'outils.                                                                                                                                                                                                                                                      |
| `Ctrl+B`                       | Pendant qu'une commande shell de premier plan est en cours d'exécution : la promouvoir en tâche d'arrière-plan. L'enfant continue de s'exécuter, le tour de l'agent est débloqué, et le shell apparaît dans `/tasks` + la boîte de dialogue Tâches d'arrière-plan. Sans effet lorsqu'aucun shell ne s'exécute — Ctrl+B est alors redirigé vers sa liaison dans la zone de saisie (curseur vers la gauche). |
| `Alt/Option+M`                 | Activer/désactiver la sortie Markdown entre les aperçus enrichis et le mode brut/source. Sur macOS, le terminal doit envoyer Option en tant que Meta.                                                                                                                                                          |
| `Shift+Tab` (`Tab` sur Windows) | Faire défiler les modes d'approbation (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                      |

## Invite de saisie

| Raccourci                                             | Description                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Activer/désactiver le mode shell lorsque l'entrée est vide.                                                                             |
| `?`                                                   | Afficher/masquer l'affichage des raccourcis clavier lorsque l'entrée est vide.                                                          |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insérer une nouvelle ligne.                                                                                                             |
| `Down Arrow`                                          | Ligne suivante, puis accrocher à la fin, puis historique suivant.                                                                       |
| `Enter`                                               | Soumettre l'invite actuelle.                                                                                                            |
| `Meta+Delete` / `Ctrl+Delete`                         | Supprimer le mot à droite du curseur.                                                                                                   |
| `Tab`                                                 | Compléter automatiquement la suggestion actuelle si elle existe.                                                                        |
| `Up Arrow`                                            | Ligne précédente, puis accrocher au début, puis historique précédent.                                                                   |
| `Ctrl+A` / `Home`                                     | Déplacer le curseur au début de la ligne.                                                                                               |
| `Ctrl+B` / `Left Arrow`                               | Déplacer le curseur d'un caractère vers la gauche.                                                                                      |
| `Ctrl+C`                                              | Effacer l'invite de saisie.                                                                                                             |
| `Esc` (double pression)                               | Effacer l'invite de saisie.                                                                                                             |
| `Ctrl+D` / `Delete`                                   | Supprimer le caractère à droite du curseur.                                                                                             |
| `Ctrl+E` / `End`                                      | Déplacer le curseur à la fin de la ligne.                                                                                               |
| `Ctrl+F` / `Right Arrow`                              | Déplacer le curseur d'un caractère vers la droite.                                                                                      |
| `Ctrl+H` / `Backspace`                                | Supprimer le caractère à gauche du curseur.                                                                                             |
| `Ctrl+K`                                              | Supprimer depuis le curseur jusqu'à la fin de la ligne.                                                                                 |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`      | Déplacer le curseur d'un mot vers la gauche.                                                                                            |
| `Ctrl+N`                                              | Ligne suivante, puis accrocher à la fin, puis historique suivant.                                                                       |
| `Ctrl+P`                                              | Ligne précédente, puis accrocher au début, puis historique précédent.                                                                   |
| `Ctrl+R`                                              | Recherche inversée dans l'historique d'entrée/shell.                                                                                    |
| `Ctrl+Y`                                              | Réessayer la dernière requête ayant échoué.                                                                                             |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`    | Déplacer le curseur d'un mot vers la droite.                                                                                            |
| `Ctrl+U`                                              | Supprimer depuis le curseur jusqu'au début de la ligne.                                                                                 |
| `Ctrl+V` (Windows : `Alt+V`)                          | Coller le contenu du presse-papier. Si le presse-papier contient une image, elle sera sauvegardée et une référence sera insérée dans l'invite. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Supprimer le mot à gauche du curseur.                                                                                                   |
| `Ctrl+X` / `Meta+Enter`                               | Ouvrir l'entrée actuelle dans un éditeur externe.                                                                                       |

## Suggestions

| Raccourci                 | Description                                   |
| ------------------------- | --------------------------------------------- |
| `Down Arrow` / `Ctrl+N`   | Naviguer vers le bas dans les suggestions.    |
| `Tab` / `Enter`           | Accepter la suggestion sélectionnée.          |
| `Up Arrow` / `Ctrl+P`     | Naviguer vers le haut dans les suggestions.   |

## Sélection par bouton radio

| Raccourci                      | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` / `Ctrl+N`  | Déplacer la sélection vers le bas.                                                                             |
| `Enter`                        | Confirmer la sélection.                                                                                        |
| `Up Arrow` / `k` / `Ctrl+P`    | Déplacer la sélection vers le haut.                                                                            |
| `1-9`                          | Sélectionner un élément par son numéro.                                                                        |
| (plusieurs chiffres)           | Pour les éléments avec des numéros supérieurs à 9, appuyez rapidement sur les chiffres pour sélectionner l'élément correspondant. |

## Défilement arrière de l'historique

Actif uniquement lorsque `ui.useTerminalBuffer` est activé (Paramètres → UI → Historique virtualisé). Dans ce mode, l'historique de la conversation est affiché dans une fenêtre interne à l'application au lieu du défilement arrière du terminal hôte, donc les touches ci-dessous remplacent le défilement natif du terminal.

| Raccourci        | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `Shift+Up`       | Faire défiler l'historique d'une ligne vers le haut.           |
| `Shift+Down`     | Faire défiler l'historique d'une ligne vers le bas.            |
| `PgUp`           | Faire défiler l'historique d'une page (hauteur de la fenêtre). |
| `PgDn`           | Faire défiler l'historique d'une page (hauteur de la fenêtre). |
| `Ctrl+Home`      | Aller au début de la conversation.                             |
| `Ctrl+End`       | Aller à la fin (et réactiver le suivi automatique en direct).  |
| **Molette**      | Faire défiler l'historique (3 lignes par pas).                 |

Lorsque `ui.useTerminalBuffer` est activé, le terminal transmet les événements de souris à qwen-code afin que la molette puisse contrôler la fenêtre interne. Par conséquent, **la sélection de texte native par clic et glissement est consommée par le programme** — maintenez `Shift` (ou `Option` sur Terminal macOS / iTerm) enfoncé lors du glissement pour contourner la capture de la souris et sélectionner le texte de la manière habituelle.

### Défilement tactile dans tmux

Dans tmux, certains terminaux traduisent les gestes du pavé tactile ou de la molette en simples séquences `Up Arrow` et `Down Arrow` avant que qwen-code ne les voie. Ces octets sont identiques à des pressions réelles de touches fléchées, donc qwen-code ne peut pas distinguer si vous vouliez faire défiler la fenêtre ou naviguer dans l'historique des invites.

Si le défilement tactile modifie l'historique des invites dans tmux, activez `ui.useTerminalBuffer` ; utilisez ensuite `Shift+Up` / `Shift+Down`, ou la molette de la souris lorsque tmux transmet les événements de molette à l'application. Si vous préférez le défilement arrière de l'hôte, ajustez les liaisons de souris de tmux pour les événements de molette.

## Intégration IDE

| Raccourci | Description                       |
| --------- | --------------------------------- |
| `Ctrl+G`  | Voir le contexte CLI reçu de l'IDE |
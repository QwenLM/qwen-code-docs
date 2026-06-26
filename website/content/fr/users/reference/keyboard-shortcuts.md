# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Raccourci                       | Description                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Esc`                          | Fermer les boîtes de dialogue et les suggestions.                                                                                                                                                                                                                                                                                                                              |
| `Ctrl+C`                       | Annuler la demande en cours et effacer la saisie. Appuyez deux fois pour quitter l'application.                                                                                                                                                                                                                                                                                |
| `Ctrl+D`                       | Quitter l'application si la saisie est vide. Appuyez deux fois pour confirmer.                                                                                                                                                                                                                                                                                                 |
| `Ctrl+L`                       | Effacer l'écran.                                                                                                                                                                                                                                                                                                                                                               |
| `Ctrl+O`                       | Activer/désactiver le mode compact (afficher/masquer les sorties des outils et la réflexion).                                                                                                                                                                                                                                                                                  |
| `Ctrl+S`                       | Permet aux longues réponses de s'afficher entièrement, en désactivant la troncature. Utilisez le défilement arrière de votre terminal pour voir l'intégralité de la sortie.                                                                                                                                                                                                     |
| `Ctrl+T`                       | Activer/désactiver l'affichage des descriptions d'outils.                                                                                                                                                                                                                                                                                                                      |
| `Ctrl+B`                       | Lorsqu'une commande shell en avant-plan est en cours d'exécution : la promouvoir en tâche d'arrière-plan. Le processus enfant continue de s'exécuter, le tour de l'agent est débloqué, et le shell apparaît dans `/tasks` + la boîte de dialogue des tâches en arrière-plan. Sans effet lorsqu'aucun shell n'est en cours d'exécution — Ctrl+B est alors interprété comme son raccourci de zone de saisie (curseur à gauche). |
| `Alt/Option+M`                 | Activer/désactiver la sortie Markdown entre les aperçus riches rendus et le mode brut/source. Sur macOS, le terminal doit envoyer Option en tant que Meta.                                                                                                                                                                                                                     |
| `Shift+Tab` (`Tab` sur Windows) | Parcourir les modes d'approbation (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                                                                                         |

## Saisie de l'invite

| Raccourci                                              | Description                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Activer/désactiver le mode shell lorsque la saisie est vide.                                                                        |
| `?`                                                   | Activer/désactiver l'affichage des raccourcis clavier lorsque la saisie est vide.                                                   |
| `Ctrl+Entrée` / `Cmd+Entrée` / `Maj+Entrée` / `Ctrl+J` | Insérer un saut de ligne.                                                                                                           |
| `Flèche bas`                                          | Ligne suivante, puis aller à la fin, puis historique suivant.                                                                       |
| `Entrée`                                              | Soumettre l'invite actuelle.                                                                                                        |
| `Meta+Suppr` / `Ctrl+Suppr`                           | Supprimer le mot à droite du curseur.                                                                                               |
| `Tab`                                                 | Autocompléter la suggestion actuelle si elle existe.                                                                                |
| `Flèche haut`                                         | Ligne précédente, puis aller au début, puis historique précédent.                                                                   |
| `Ctrl+A` / `Début`                                    | Déplacer le curseur au début de la ligne.                                                                                           |
| `Ctrl+B` / `Flèche gauche`                            | Déplacer le curseur d'un caractère vers la gauche.                                                                                  |
| `Ctrl+C`                                              | Effacer la saisie de l'invite.                                                                                                      |
| `Esc` (double pression)                               | Effacer la saisie de l'invite.                                                                                                      |
| `Ctrl+D` / `Suppr`                                    | Supprimer le caractère à droite du curseur.                                                                                         |
| `Ctrl+E` / `Fin`                                      | Déplacer le curseur à la fin de la ligne.                                                                                           |
| `Ctrl+F` / `Flèche droite`                            | Déplacer le curseur d'un caractère vers la droite.                                                                                  |
| `Ctrl+H` / `Retour arrière`                           | Supprimer le caractère à gauche du curseur.                                                                                         |
| `Ctrl+K`                                              | Supprimer du curseur à la fin de la ligne.                                                                                          |
| `Ctrl+Flèche gauche` / `Meta+Flèche gauche` / `Meta+B` | Déplacer le curseur d'un mot vers la gauche.                                                                                        |
| `Ctrl+N`                                              | Ligne suivante, puis aller à la fin, puis historique suivant.                                                                       |
| `Ctrl+P`                                              | Ligne précédente, puis aller au début, puis historique précédent.                                                                   |
| `Ctrl+R`                                              | Recherche inversée dans l'historique de la saisie/du shell.                                                                         |
| `Ctrl+Y`                                              | Réessayer la dernière demande échouée.                                                                                              |
| `Ctrl+Flèche droite` / `Meta+Flèche droite` / `Meta+F` | Déplacer le curseur d'un mot vers la droite.                                                                                        |
| `Ctrl+U`                                              | Supprimer du curseur au début de la ligne.                                                                                          |
| `Ctrl+V` (Windows : `Alt+V`)                         | Coller le contenu du presse-papiers. Si le presse-papiers contient une image, elle sera sauvegardée et une référence à celle-ci sera insérée dans l'invite. |
| `Ctrl+W` / `Meta+Retour arrière` / `Ctrl+Retour arrière` | Supprimer le mot à gauche du curseur.                                                                                               |
| `Ctrl+X` / `Meta+Entrée`                              | Ouvrir la saisie actuelle dans un éditeur externe.                                                                                  |
## Suggestions

| Raccourci                       | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `Flèche bas` / `Ctrl+N`         | Naviguer vers le bas dans les suggestions.      |
| `Tab` / `Entrée`                | Accepter la suggestion sélectionnée.           |
| `Flèche haut` / `Ctrl+P`        | Naviguer vers le haut dans les suggestions.    |

## Sélection par bouton radio

| Raccourci                        | Description                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Flèche bas` / `j` / `Ctrl+N`    | Déplacer la sélection vers le bas.                                                                                       |
| `Entrée`                         | Confirmer la sélection.                                                                                                  |
| `Flèche haut` / `k` / `Ctrl+P`   | Déplacer la sélection vers le haut.                                                                                      |
| `1-9`                            | Sélectionner un élément par son numéro.                                                                                  |
| (plusieurs chiffres)             | Pour les éléments avec des numéros supérieurs à 9, appuyez rapidement sur les chiffres pour sélectionner l'élément correspondant. |

## Défilement de l'historique

Actif uniquement lorsque `ui.useTerminalBuffer` est activé (Paramètres → UI → Historique virtualisé). Dans ce mode, l'historique de la conversation est affiché dans une zone de visualisation interne à l'application au lieu du défilement natif du terminal hôte, donc les touches ci-dessous remplacent le défilement natif du terminal.

| Raccourci        | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `Maj+Flèche haut` | Faire défiler l'historique d'une ligne vers le haut.          |
| `Maj+Flèche bas`  | Faire défiler l'historique d'une ligne vers le bas.           |
| `PgUp`           | Faire défiler l'historique d'une page vers le haut (hauteur de la vue). |
| `PgDn`           | Faire défiler l'historique d'une page vers le bas (hauteur de la vue). |
| `Ctrl+Origine`   | Aller au début de la conversation.                            |
| `Ctrl+Fin`       | Aller à la fin (et réactiver le suivi automatique en direct). |
| **Molette**      | Faire défiler l'historique (3 lignes par cran).               |

Lorsque `ui.useTerminalBuffer` est activé, le terminal transmet les événements de souris à qwen-code afin que la molette puisse piloter la zone de visualisation interne. Par conséquent, **la sélection de texte native par clic-glissé est consommée par le programme** — maintenez `Maj` (ou `Option` dans Terminal macOS / iTerm) enfoncé pendant le glissement pour contourner la capture de la souris et sélectionner le texte de la manière habituelle.

### Défilement par pavé tactile dans tmux

Dans tmux, certains terminaux traduisent les gestes du pavé tactile ou de la molette en séquences de `Flèche haut` et `Flèche bas` avant que qwen-code ne les voie. Ces octets sont identiques à de véritables pressions de touches de flèche, donc qwen-code ne peut pas savoir si vous avez voulu faire défiler la zone de visualisation ou naviguer dans l'historique des invites.

Si le défilement par pavé tactile modifie l'historique des invites dans tmux, activez `ui.useTerminalBuffer` ; utilisez ensuite `Maj+Flèche haut` / `Maj+Flèche bas`, ou la molette lorsque tmux transmet les événements de la molette à l'application. Si vous préférez le défilement natif de l'hôte, ajustez les liaisons de souris de tmux pour les événements de la molette.

## Intégration IDE

| Raccourci | Description                              |
| --------- | ---------------------------------------- |
| `Ctrl+G`  | Voir le contexte que la CLI a reçu de l'IDE |

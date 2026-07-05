# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Shortcut                       | Description                                                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Ferme les boîtes de dialogue et les suggestions.                                                                                                                                                                                                                                                                            |
| `Ctrl+C`                       | Annule la requête en cours et efface l'entrée. Appuyez deux fois pour quitter l'application.                                                                                                                                                                                                                      |
| `Ctrl+D`                       | Quitte l'application si l'entrée est vide. Appuyez deux fois pour confirmer.                                                                                                                                                                                                                                       |
| `Ctrl+L`                       | Efface l'écran.                                                                                                                                                                                                                                                                                         |
| `Ctrl+O`                       | Active/désactive le mode compact (masque/affiche la sortie des outils et la réflexion).                                                                                                                                                                                                                                                 |
| `Ctrl+S`                       | Permet d'afficher intégralement les réponses longues en désactivant la troncature. Utilisez le défilement de votre terminal pour voir la sortie complète.                                                                                                                                                                                     |
| `Ctrl+T`                       | Active/désactive l'affichage des descriptions des outils.                                                                                                                                                                                                                                                                  |
| `Ctrl+B`                       | Lorsqu'une commande shell au premier plan est en cours d'exécution : la transforme en tâche d'arrière-plan. Le processus enfant continue de s'exécuter, le tour de l'agent se débloque, et le shell apparaît dans `/tasks` + la boîte de dialogue des tâches d'arrière-plan. Aucune action si aucun shell n'est en cours d'exécution — Ctrl+B est alors transmis à son raccourci dans la zone de saisie (curseur à gauche). |
| `Alt/Option+M`                 | Bascule la sortie Markdown entre les aperçus enrichis et le mode brut/source. Sur macOS, le terminal doit envoyer Option comme Meta.                                                                                                                                                                               |
| `Shift+Tab` (`Tab` sur Windows) | Alterne entre les modes d'approbation (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                                 |

## Invite de saisie

| Shortcut                                              | Description                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Active/désactive le mode shell lorsque l'entrée est vide.                                                                                          |
| `?`                                                   | Active/désactive l'affichage des raccourcis clavier lorsque l'entrée est vide.                                                                          |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insère un saut de ligne.                                                                                                                   |
| `Flèche bas`                                          | Descend d'une ligne, puis saute à la fin, puis passe à l'historique suivant.                                                                                      |
| `Enter`                                               | Soumet le prompt actuel.                                                                                                          |
| `Meta+Delete` / `Ctrl+Delete`                         | Supprime le mot à droite du curseur.                                                                                         |
| `Tab`                                                 | Complète automatiquement la suggestion actuelle si elle existe.                                                                                  |
| `Flèche haut`                                            | Remonte d'une ligne, puis saute au début, puis passe à l'historique précédent.                                                                                      |
| `Ctrl+A` / `Home`                                     | Déplace le curseur au début de la ligne.                                                                                       |
| `Ctrl+B` / `Flèche gauche`                               | Déplace le curseur d'un caractère vers la gauche.                                                                                          |
| `Ctrl+C`                                              | Efface l'invite de saisie.                                                                                                              |
| `Esc` (double appui)                                  | Efface l'invite de saisie.                                                                                                             |
| `Ctrl+D` / `Delete`                                   | Supprime le caractère à droite du curseur.                                                                                    |
| `Ctrl+E` / `End`                                      | Déplace le curseur à la fin de la ligne.                                                                                             |
| `Ctrl+F` / `Flèche droite`                              | Déplace le curseur d'un caractère vers la droite.                                                                                         |
| `Ctrl+H` / `Backspace`                                | Supprime le caractère à gauche du curseur.                                                                                     |
| `Ctrl+K`                                              | Supprime du curseur jusqu'à la fin de la ligne.                                                                                      |
| `Ctrl+Flèche gauche` / `Meta+Flèche gauche` / `Meta+B`      | Déplace le curseur d'un mot vers la gauche.                                                                                               |
| `Ctrl+N`                                              | Descend d'une ligne, puis saute à la fin, puis passe à l'historique suivant.                                                                                      |
| `Ctrl+P`                                              | Remonte d'une ligne, puis saute au début, puis passe à l'historique précédent.                                                                                      |
| `Ctrl+R`                                              | Recherche inversée dans l'historique de saisie/shell.                                                                                         |
| `Ctrl+Y`                                              | Réessaie la dernière requête échouée.                                                                                                      |
| `Ctrl+Flèche droite` / `Meta+Flèche droite` / `Meta+F`    | Déplace le curseur d'un mot vers la droite.                                                                                              |
| `Ctrl+U`                                              | Supprime du curseur jusqu'au début de la ligne.                                                                                |
| `Ctrl+V` (Windows : `Alt+V`)                           | Colle le contenu du presse-papiers. Si le presse-papiers contient une image, elle sera enregistrée et une référence y sera insérée dans le prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Supprime le mot à gauche du curseur.                                                                                          |
| `Ctrl+X`                                              | Ouvre la saisie actuelle dans un éditeur externe.                                                                                       |

## Suggestions

| Shortcut                | Description                            |
| ----------------------- | -------------------------------------- |
| `Flèche bas` / `Ctrl+N` | Navigue vers le bas dans les suggestions. |
| `Tab` / `Enter`         | Accepte la suggestion sélectionnée.        |
| `Flèche haut` / `Ctrl+P`   | Navigue vers le haut dans les suggestions.   |

## Sélection par bouton radio

| Shortcut                      | Description                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Flèche bas` / `j` / `Ctrl+N` | Déplace la sélection vers le bas.                                                                                          |
| `Enter`                       | Confirme la sélection.                                                                                            |
| `Flèche haut` / `k` / `Ctrl+P`   | Déplace la sélection vers le haut.                                                                                            |
| `1-9`                         | Sélectionne un élément par son numéro.                                                                                 |
| (multi-chiffres)                 | Pour les éléments dont le numéro est supérieur à 9, appuyez rapidement sur les chiffres successifs pour sélectionner l'élément correspondant. |

## Défilement de l'historique

Actif uniquement lorsque `ui.useTerminalBuffer` est activé (Settings → UI → Virtualized History). Dans ce mode, l'historique des conversations est rendu dans une zone d'affichage interne à l'application au lieu du défilement du terminal hôte, les touches ci-dessous remplacent donc le défilement natif du terminal.

| Shortcut        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `Shift+Flèche haut`      | Fait défiler l'historique d'une ligne vers le haut.                          |
| `Shift+Flèche bas`    | Fait défiler l'historique d'une ligne vers le bas.                        |
| `PgUp`          | Fait défiler l'historique d'une page vers le haut (hauteur de la zone d'affichage).        |
| `PgDn`          | Fait défiler l'historique d'une page vers le bas (hauteur de la zone d'affichage).      |
| `Ctrl+Home`     | Saute au début de la conversation.                 |
| `Ctrl+End`      | Saute à la fin (et réactive le suivi automatique en direct). |
| **Molette de la souris** | Fait défiler l'historique (3 lignes par cran).                   |
Lorsque `ui.useTerminalBuffer` est activé, le terminal transmet les événements de la souris à qwen-code afin que la molette puisse contrôler le viewport de l'application. Comme effet secondaire, **la sélection de texte native par clic et glisser est interceptée par le programme** — maintenez `Shift` (ou `Option` sur macOS Terminal / iTerm) enfoncé lors du glissement pour contourner la capture de la souris et sélectionner le texte de manière habituelle.

### Défilement au trackpad dans tmux

Dans tmux, certains terminaux traduisent les gestes du trackpad ou de la molette en simples séquences `Up Arrow` et `Down Arrow` avant que qwen-code ne les reçoive. Ces octets sont identiques à de véritables pressions sur les touches fléchées, donc qwen-code ne peut pas déterminer si vous vouliez faire défiler le viewport ou naviguer dans l'historique des prompts.

Si le défilement au trackpad modifie l'historique des prompts dans tmux, activez `ui.useTerminalBuffer` ; utilisez ensuite `Shift+Up` / `Shift+Down`, ou la molette de la souris lorsque tmux transmet les événements de la molette à l'application. Si vous préférez le scrollback de l'hôte, ajustez les raccourcis souris de tmux pour les événements de la molette.

## Intégration IDE

| Raccourci | Description |
| --------- | ----------- |
| `Ctrl+G` | Afficher le contexte CLI reçu de l'IDE |
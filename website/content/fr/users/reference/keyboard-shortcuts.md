# Raccourcis clavier de Qwen Code

Ce document liste les raccourcis clavier disponibles dans Qwen Code.

## Général

| Shortcut                       | Description                                                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Ferme les boîtes de dialogue et les suggestions. Avec un prompt vide, annule une requête en cours ; en mode inactif hors mode IDE, appuyez deux fois pour ouvrir le sélecteur de rewind.                                                                                                                                            |
| `Ctrl+C`                       | Annule la requête en cours et efface l'entrée. Appuyez deux fois pour quitter l'application.                                                                                                                                                                                                                      |
| `Ctrl+D`                       | Quitte l'application si l'entrée est vide. Appuyez deux fois pour confirmer.                                                                                                                                                                                                                                       |
| `Ctrl+L`                       | Efface l'écran.                                                                                                                                                                                                                                                                                         |
| `Ctrl+O` / `Alt/Option+T`      | Active/désactive le mode détaillé développé : déploie ou réduit tous les blocs de réflexion et les sorties des outils en ligne. Appuyez à nouveau pour réduire. Quand `ui.useTerminalBuffer` est désactivé, la bascule redessine la conversation complète avec une sortie non tronquée dans le scrollback du terminal. |
| `Ctrl+S`                       | Met en réserve la saisie non vide pour le projet en cours et la restaure au prochain lancement. Avec une saisie vide, permet d'afficher intégralement les réponses longues en désactivant la troncature. Utilisez le défilement de votre terminal pour voir la sortie complète.                                                                                          |
| `Ctrl+T`                       | Active/désactive l'affichage des descriptions des outils.                                                                                                                                                                                                                                                                  |
| `Alt/Option+M`                 | Bascule la sortie Markdown entre les aperçus enrichis et le mode brut/source. Sur macOS, le terminal doit envoyer Option comme Meta.                                                                                                                                                                               |
| `Shift+Tab` (`Tab` sur Windows) | Alterne entre les modes d'approbation (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                                 |

## Invite de saisie

| Shortcut                                              | Description                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Active/désactive le mode shell lorsque l'entrée est vide.                                                                                          |
| `?`                                                   | Active/désactive l'affichage des raccourcis clavier lorsque l'entrée est vide.                                                                          |
| `/`                                                   | Ouvre la complétion des slash commands.                                                                                                      |
| `@`                                                   | Ouvre la complétion pour les fichiers, dossiers et autres contextes.                                                                              |
| `Space` (prompt vide)                                | Démarre la dictée vocale lorsqu'elle et un modèle vocal sont configurés ; le comportement (maintien ou appui) suit `general.voice.mode`.                  |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insère un saut de ligne.                                                                                                                   |
| `Flèche bas`                                          | Descend d'une ligne, puis saute à la fin, puis passe à l'historique suivant.                                                                                      |
| `Enter`                                               | Soumet le prompt actuel. Pendant l'exécution d'une réponse, oriente le tour en cours.                                                     |
| `Ctrl+Q`                                              | Met en file d'attente le prompt ou la commande actuel pour le prochain tour au lieu d'orienter ; il s'exécute quand Qwen Code revient en mode inactif.                 |
| `Flèche haut` (en haut) / `Esc`                       | Lorsque des messages en attente sont présents, les replace dans la saisie pour édition.                                                        |
| `Meta+D` / `Meta+Delete` / `Ctrl+Delete`              | Supprime le mot à droite du curseur.                                                                                         |
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
| `Ctrl+V` / `Option+V` (Windows : `Alt+V`)              | Colle le contenu du presse-papiers. Si le presse-papiers contient une image, elle sera enregistrée et une référence y sera insérée dans le prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Supprime le mot à gauche du curseur.                                                                                          |
| `Ctrl+X`                                              | Ouvre la saisie actuelle dans un éditeur externe.                                                                                       |
| `Ctrl+Z`                                              | Annule la dernière modification de la saisie.                                                                                                           |
| `Ctrl+Shift+Z`                                        | Rétablit la dernière modification annulée de la saisie.                                                                                                    |

## Shell au premier plan

Ces raccourcis s'appliquent lorsqu'une commande shell interactive au premier plan est en cours d'exécution.

| Shortcut                            | Description                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+F`                            | Bascule le focus clavier entre le shell et le prompt. Quand aucun shell n'est en cours, `Ctrl+F` déplace le curseur du prompt vers la droite.                                      |
| `Ctrl+Shift+Haut` / `Ctrl+Shift+Bas` | Fait défiler le shell ciblé vers le haut ou le bas.                                                                                                                           |
| `Ctrl+B`                            | Transforme le shell en tâche d'arrière-plan. Le processus enfant continue de s'exécuter, le tour de l'agent se débloque, et le shell apparaît dans `/tasks` et la boîte de dialogue des tâches d'arrière-plan. |

## Suggestions

| Shortcut                             | Description                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `Flèche bas` / `Ctrl+N`              | Navigue vers le bas dans les suggestions.                                   |
| `Tab` / `Enter`                      | Accepte la suggestion sélectionnée.                                          |
| `Flèche haut` / `Ctrl+P`             | Navigue vers le haut dans les suggestions.                                     |
| `Flèche droite`                      | Accepte une suggestion en texte fantôme lorsque le prompt est vide.                 |
| `Ctrl+Tab` / `Ctrl+Flèche droite`    | Passe à la catégorie de complétion suivante lorsque les onglets de catégorie sont affichés.     |
| `Ctrl+Shift+Tab` / `Ctrl+Flèche gauche` | Passe à la catégorie de complétion précédente lorsque les onglets de catégorie sont affichés. |

## Recherche dans l'historique

Appuyez sur `Ctrl+R` pour rechercher dans l'historique des prompts, ou dans l'historique shell lorsque le mode shell est actif.

| Shortcut                     | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `Flèche haut` / `Flèche bas` | Navigue parmi les entrées de l'historique correspondantes.                 |
| `Flèche gauche` / `Flèche droite` | Réduit ou développe une entrée longue sélectionnée.                  |
| `Tab`                        | Insère l'entrée sélectionnée dans le prompt sans l'envoyer. |
| `Enter`                      | Soumet l'entrée sélectionnée.                                 |
| `Esc`                        | Ferme la recherche dans l'historique.                                      |

## Sélection par bouton radio

| Shortcut                      | Description                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Flèche bas` / `j` / `Ctrl+N` | Déplace la sélection vers le bas.                                                                                          |
| `Enter`                       | Confirme la sélection.                                                                                            |
| `Flèche haut` / `k` / `Ctrl+P`   | Déplace la sélection vers le haut.                                                                                            |
| `1-9`                         | Sélectionne un élément par son numéro.                                                                                 |
| (multi-chiffres)                 | Pour les éléments dont le numéro est supérieur à 9, appuyez rapidement sur les chiffres successifs pour sélectionner l'élément correspondant. |

## Défilement de l'historique

Actif lorsque `ui.useTerminalBuffer` est activé (Settings → UI → Virtualized History), que le mode lecteur d'écran est désactivé, et que Qwen Code s'exécute dans un terminal interactif compatible (`stdout` est un TTY, CI est inactif, et `TERM` n'est pas `dumb`), ce qui est le comportement par défaut pour les sessions normales sans lecteur d'écran. Dans ce mode, l'historique des conversations est rendu dans une zone d'affichage interne à l'application au lieu du défilement du terminal hôte, les touches ci-dessous remplacent donc le défilement natif du terminal.

| Shortcut        | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `Shift+Flèche haut`      | Fait défiler l'historique d'une ligne vers le haut.                                                     |
| `Shift+Flèche bas`    | Fait défiler l'historique d'une ligne vers le bas.                                                   |
| `PgUp`          | Fait défiler l'historique d'une page vers le haut (hauteur de la zone d'affichage).                                   |
| `PgDn`          | Fait défiler l'historique d'une page vers le bas (hauteur de la zone d'affichage).                                 |
| `Ctrl+Home`     | Saute au début de la conversation.                                            |
| `Ctrl+End`      | Saute à la fin (et réactive le suivi automatique en direct).                            |
| **Molette de la souris** | Fait défiler l'historique (3 lignes par cran). Nécessite `ui.mouseTracking` (activé par défaut). |

Lorsque `ui.useTerminalBuffer` est activé et `ui.mouseTracking` est activé (par défaut), le terminal transmet les événements de la souris à qwen-code afin que la molette puisse contrôler la zone d'affichage interne. Comme effet secondaire, la sélection de texte native par clic et glisser est interceptée par le programme, donc qwen-code fournit la sienne propre : **glissez pour sélectionner du texte dans la zone d'affichage de l'historique, double-cliquez pour sélectionner un mot, triple-cliquez pour sélectionner une ligne.** La sélection est surlignée et copiée dans le presse-papiers lorsque vous relâchez la souris (fonctionne en local, via SSH avec OSC 52, et dans tmux). Un simple clic efface la sélection ; le défilement ou une nouvelle sortie l'efface également. La sélection est limitée à la zone d'affichage visible pour le moment. Vous pouvez toujours revenir à la sélection propre au terminal en maintenant `Shift` (ou `Option` sur macOS Terminal / iTerm) enfoncé lors du glissement. Définissez `ui.mouseTracking` sur `false` pour empêcher qwen-code de capturer la souris entièrement ; cela restaure le menu contextuel natif du terminal, les clics sur les liens OSC 8 et la sélection par clic et glisser, mais la zone d'affichage interne ne répond plus à la souris — utilisez les raccourcis clavier ci-dessus pour faire défiler.

### Défilement au trackpad dans tmux

Dans tmux, certains terminaux traduisent les gestes du trackpad ou de la molette en simples séquences `Up Arrow` et `Down Arrow` avant que qwen-code ne les reçoive. Ces octets sont identiques à de véritables pressions sur les touches fléchées, donc qwen-code ne peut pas déterminer si vous vouliez faire défiler la zone d'affichage ou naviguer dans l'historique des prompts.

Si le défilement au trackpad modifie l'historique des prompts dans tmux, assurez-vous que `ui.useTerminalBuffer` est activé ; utilisez ensuite `Shift+Up` / `Shift+Down`, ou la molette de la souris lorsque tmux transmet les événements de la molette à l'application (nécessite `ui.mouseTracking`). Si vous préférez le scrollback de l'hôte, ajustez les raccourcis souris de tmux pour les événements de la molette.

## Intégration IDE

| Raccourci | Description |
| --------- | ----------- |
| `Ctrl+G` | Afficher le contexte CLI reçu de l'IDE |

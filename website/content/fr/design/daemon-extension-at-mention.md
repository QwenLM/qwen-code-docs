# Prise en charge des mentions @extension par le Daemon

## Objectif

Le Daemon WebShell doit correspondre au comportement de mention d'extension de la CLI pour les extensions actives. Les utilisateurs peuvent découvrir les extensions actives via la complétion `@`, sélectionner une mention canonique `@ext:<name>`, et faire en sorte que le daemon injecte le contexte de cette extension dans le tour du modèle sans modifier le texte du prompt visible.

## Conception

- La complétion `@` du WebShell combine les entrées d'extensions actives provenant du statut des extensions de l'espace de travail avec les correspondances de fichiers existantes de l'espace de travail. Un `@` seul affiche les extensions en premier, `@bro` filtre les extensions et les fichiers, et `@ext:` bascule vers une complétion réservée aux extensions.
- La complétion d'extension insère `@ext:<extension.name> ` afin que le daemon reçoive une référence stable, indépendante du texte affiché.
- Le statut des extensions du daemon inclut un champ `description` optionnel, renseigné à partir de la configuration de l'extension installée. Ce champ est additif pour les anciens clients.
- La résolution du prompt de session ACP analyse les blocs de prompt textuels à la recherche de tokens `@ext:<name>`, ne fait correspondre que les extensions actives de la configuration de session, déduplique les mentions répétées et ignore silencieusement les noms inconnus ou inactifs.
- Le texte visible par l'utilisateur est préservé exactement. Le contexte d'extension résolu est ajouté sous forme de parties de texte supplémentaires pour le modèle après le texte de l'utilisateur.
- La CLI et le daemon partagent des utilitaires de mention d'extension pour le parsing, le nettoyage du texte affiché, le formatage des capacités, et la lecture des fichiers de contexte avec des contrôles de sous-chemin et de taille.

## Limites

Les lectures de fichiers de contexte sont limitées par fichier et par le budget global de contexte d'extension. Les fichiers en dehors du répertoire de l'extension installée sont ignorés, les fichiers illisibles sont ignorés avec une sortie de débogage, et les mentions répétées ne consomment le budget qu'une seule fois.

## Vérification

Des tests ciblés couvrent les modes de complétion du WebShell, l'injection de contexte ACP du daemon, les mentions répétées et inconnues, les fichiers de contexte limités, et les processeurs de mention d'extension existants de la CLI. La vérification finale exécute le build et le typecheck du dépôt.
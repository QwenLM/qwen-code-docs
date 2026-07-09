# Puces d'icônes pour les mentions Web Shell

## Problème

Le menu de mention @ personnalisé peut insérer des références d'extensions, de fichiers et MCP, mais les éléments acceptés étaient rendus sous forme de texte brut dans le compositeur. Une précédente implémentation du compositeur affichait ces références sous forme de puces d'icônes. L'architecture de mention personnalisée actuelle nécessite également un moyen permettant aux éléments de mention définis par l'hôte, tels que les tableaux, d'utiliser le même rendu de puce.

## Conception

- Le menu de mention @ reste responsable du choix et de l'insertion du texte.
- Permettre aux éléments de mention de fournir facultativement un `composerTag` décrivant la référence insérée.
- Continuer à créer automatiquement des `composerTag` pour les fournisseurs intégrés de fichiers, d'extensions et MCP, afin que les mentions intégrées existantes retrouvent leurs puces d'icônes sans nécessiter de modifications côté hôte.
- Ajouter une prop `composerTagIcons` sur `WebShell` afin que les hôtes puissent enregistrer des URL d'icônes par `composerTag.kind`.
- Résoudre les icônes au moment du rendu du compositeur via un utilitaire qui vérifie d'abord les icônes personnalisées et se rabat sur les icônes intégrées.
- Stocker les URL d'icônes résolues uniquement dans les données de décoration en ligne internes et les retirer des valeurs publiques des balises du compositeur.

## Portée

Cette modification couvre l'enregistrement et le rendu des icônes des balises du compositeur pour les éléments de mention @ acceptés et les balises en ligne insérées programmatiquement. Elle ne modifie pas les lignes visibles du sélecteur de mentions @ et n'ajoute pas de nouvelle API d'enregistrement de fournisseur au-delà de la surface `atProviders` existante.

## Risques

- Les URL d'icônes personnalisées sont appliquées via des masques CSS ; les valeurs d'URL doivent donc être échappées avant l'écriture des propriétés personnalisées CSS.
- Les décorations en ligne existantes doivent être actualisées si `composerTagIcons` change alors que du texte est présent dans l'éditeur.
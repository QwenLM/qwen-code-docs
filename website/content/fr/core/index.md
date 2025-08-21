# Qwen Code Core

Le package core de Qwen Code (`packages/core`) constitue la partie backend de Qwen Code. Il gère la communication avec les APIs des modèles, l'administration des outils, ainsi que le traitement des requêtes envoyées depuis `packages/cli`. Pour une vue d'ensemble de Qwen Code, consultez la [page de documentation principale](../index.md).

## Navigation dans cette section

- **[API des outils principaux](./tools-api.md) :** Informations sur la façon dont les outils sont définis, enregistrés et utilisés par le core.
- **[Processeur d'importation de mémoire](./memport.md) :** Documentation de la fonctionnalité modulaire d'import QWEN.md utilisant la syntaxe @file.md.

## Rôle du core

Bien que la partie `packages/cli` de Qwen Code fournisse l'interface utilisateur, `packages/core` est responsable de :

- **Interaction avec l'API du modèle :** Communiquer de manière sécurisée avec le fournisseur de modèle configuré, envoyer les prompts de l'utilisateur et recevoir les réponses du modèle.
- **Ingénierie des prompts :** Construire des prompts efficaces pour le modèle, en incorporant potentiellement l'historique de conversation, les définitions d'outils et le contexte instructionnel provenant des fichiers de contexte (par exemple, `QWEN.md`).
- **Gestion et orchestration des outils :**
  - Enregistrer les outils disponibles (par exemple, outils du système de fichiers, exécution de commandes shell).
  - Interpréter les demandes d'utilisation d'outils provenant du modèle.
  - Exécuter les outils demandés avec les arguments fournis.
  - Retourner les résultats d'exécution des outils au modèle pour un traitement supplémentaire.
- **Gestion des sessions et de l'état :** Suivre l'état de la conversation, y compris l'historique et tout contexte pertinent requis pour des interactions cohérentes.
- **Configuration :** Gérer les configurations spécifiques au core, telles que l'accès aux clés API, la sélection du modèle et les paramètres des outils.

## Considérations de sécurité

Le cœur joue un rôle essentiel en matière de sécurité :

- **Gestion des clés API :** Il gère les identifiants des fournisseurs et s'assure qu'ils sont utilisés de manière sécurisée lors des communications avec les APIs.
- **Exécution des outils :** Lorsque les outils interagissent avec le système local (par exemple, `run_shell_command`), le cœur (et les implémentations d'outils sous-jacentes) doit le faire avec une prudence appropriée, souvent en utilisant des mécanismes de sandboxing pour éviter les modifications non intentionnelles.

## Compression de l'historique des discussions

Pour s'assurer que les conversations longues ne dépassent pas les limites de tokens du modèle sélectionné, le cœur inclut une fonctionnalité de compression de l'historique des discussions.

Lorsqu'une conversation approche de la limite de tokens pour le modèle configuré, le cœur compresse automatiquement l'historique de la conversation avant de l'envoyer au modèle. Cette compression est conçue pour être sans perte en termes d'informations transmises, mais elle réduit le nombre total de tokens utilisés.

Vous pouvez trouver les limites de tokens pour les modèles de chaque fournisseur dans leur documentation.

## Fallback de modèle

Qwen Code inclut un mécanisme de fallback de modèle pour garantir que vous pouvez continuer à utiliser le CLI même si le modèle par défaut est limité en débit.

Si vous utilisez le modèle "pro" par défaut et que le CLI détecte que vous êtes limité en débit, il bascule automatiquement vers le modèle "flash" pour la session en cours. Cela vous permet de continuer à travailler sans interruption.

## Service de découverte de fichiers

Le service de découverte de fichiers est responsable de la recherche des fichiers dans le projet qui sont pertinents par rapport au contexte actuel. Il est utilisé par la commande `@` et d'autres outils qui nécessitent l'accès aux fichiers.

## Service de découverte mémoire

Le service de découverte mémoire est chargé de rechercher et charger les fichiers de contexte (par défaut : `QWEN.md`) qui fournissent un contexte au modèle. Il recherche ces fichiers de manière hiérarchique, en commençant par le répertoire de travail actuel, puis en remontant jusqu'à la racine du projet et au répertoire personnel de l'utilisateur. Il recherche également dans les sous-répertoires.

Cela vous permet d'avoir des fichiers de contexte globaux, au niveau du projet et au niveau des composants, qui sont tous combinés pour fournir au modèle les informations les plus pertinentes.

Vous pouvez utiliser la commande [`/memory`](../cli/commands.md) pour `show`, `add` et `refresh` le contenu des fichiers de contexte chargés.
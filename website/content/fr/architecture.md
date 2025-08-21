# Aperçu de l'architecture de Qwen Code

Ce document fournit un aperçu de haut niveau de l'architecture de Qwen Code.

## Composants principaux

Qwen Code est principalement composé de deux packages principaux, ainsi que d'une suite d'outils qui peuvent être utilisés par le système lors du traitement des entrées en ligne de commande :

1. **Package CLI (`packages/cli`) :**
   - **Objectif :** Ce package contient la partie orientée utilisateur de Qwen Code, comme la gestion de l'entrée initiale de l'utilisateur, l'affichage du résultat final, et la gestion globale de l'expérience utilisateur.
   - **Fonctions clés du package :**
     - [Traitement des entrées](./cli/commands.md)
     - Gestion de l'historique
     - Rendu de l'affichage
     - [Personnalisation des thèmes et de l'interface utilisateur](./cli/themes.md)
     - [Paramètres de configuration du CLI](./cli/configuration.md)

2. **Package Core (`packages/core`) :**
   - **Objectif :** Il sert de backend pour Qwen Code. Il reçoit les requêtes envoyées depuis `packages/cli`, orchestre les interactions avec l'API du modèle configuré, et gère l'exécution des outils disponibles.
   - **Fonctions clés du package :**
     - Client API pour communiquer avec l'API Google Gemini
     - Construction et gestion des prompts
     - Logique d'enregistrement et d'exécution des outils
     - Gestion de l'état des conversations ou sessions
     - Configuration côté serveur

3. **Outils (`packages/core/src/tools/`) :**
   - **Objectif :** Il s'agit de modules individuels qui étendent les capacités du modèle Gemini, lui permettant d'interagir avec l'environnement local (par exemple, le système de fichiers, les commandes shell, la récupération de données web).
   - **Interaction :** `packages/core` invoque ces outils en fonction des requêtes provenant du modèle Gemini.

## Interaction Flow

Une interaction typique avec Qwen Code suit ce flux :

1.  **User input :** L'utilisateur tape un prompt ou une commande dans le terminal, qui est géré par `packages/cli`.
2.  **Requête vers le core :** `packages/cli` envoie l'entrée utilisateur à `packages/core`.
3.  **Traitement de la requête :** Le package core :
    - Construit un prompt approprié pour l'API du modèle configuré, incluant éventuellement l'historique de conversation et les définitions d'outils disponibles.
    - Envoie le prompt à l'API du modèle.
4.  **Réponse de l'API du modèle :** L'API du modèle traite le prompt et renvoie une réponse. Cette réponse peut être une réponse directe ou une demande d'utilisation d'un des outils disponibles.
5.  **Exécution d'outil (si applicable) :**
    - Lorsque l'API du modèle demande un outil, le package core se prépare à l'exécuter.
    - Si l'outil demandé peut modifier le système de fichiers ou exécuter des commandes shell, l'utilisateur reçoit d'abord les détails de l'outil et de ses arguments, et doit approuver l'exécution.
    - Les opérations en lecture seule, telles que la lecture de fichiers, peuvent ne pas nécessiter de confirmation explicite de l'utilisateur pour continuer.
    - Une fois confirmé, ou si aucune confirmation n'est requise, le package core exécute l'action pertinente dans l'outil concerné, et le résultat est renvoyé à l'API du modèle par le package core.
    - L'API du modèle traite le résultat de l'outil et génère une réponse finale.
6.  **Réponse vers le CLI :** Le package core renvoie la réponse finale au package CLI.
7.  **Affichage à l'utilisateur :** Le package CLI formate et affiche la réponse à l'utilisateur dans le terminal.

## Principes de conception clés

- **Modularité :** Séparer le CLI (frontend) du Core (backend) permet un développement indépendant et des extensions futures potentielles (ex. : différents frontends pour le même backend).
- **Extensibilité :** Le système d'outils est conçu pour être extensible, permettant l'ajout de nouvelles fonctionnalités.
- **Expérience utilisateur :** Le CLI se concentre sur la fourniture d'une expérience terminal riche et interactive.
# Aperçu de l'architecture de Qwen Code

Ce document fournit une vue d'ensemble de haut niveau de l'architecture de Qwen Code.

## Composants principaux

Qwen Code est principalement composé de deux packages principaux, ainsi que d'une suite d'outils qui peuvent être utilisés par le système lors du traitement des entrées en ligne de commande :

### 1. Package CLI (`packages/cli`)

**Objectif :** Ce package contient la partie orientée utilisateur de Qwen Code, notamment la gestion de l'entrée initiale de l'utilisateur, l'affichage du résultat final et la gestion globale de l'expérience utilisateur.

**Fonctions principales :**

- **Traitement des entrées :** Gère les saisies utilisateur par différentes méthodes, notamment la saisie directe de texte, les commandes slash (par exemple, `/help`, `/clear`, `/model`), les commandes avec `@` (`@fichier` pour inclure le contenu d'un fichier) et les commandes avec `!` (`!commande` pour l'exécution dans le shell).
- **Gestion de l'historique :** Conserve l'historique des conversations et permet des fonctionnalités telles que la reprise de session.
- **Rendu de l'affichage :** Formate et affiche les réponses à l'utilisateur dans le terminal avec coloration syntaxique et mise en forme appropriée.
- **Personnalisation du thème et de l'interface :** Prend en charge des thèmes personnalisables et des éléments d'interface utilisateur pour une expérience adaptée.
- **Paramètres de configuration :** Gère diverses options de configuration via des fichiers de paramètres JSON, des variables d'environnement et des arguments en ligne de commande.

### 2. Package principal (`packages/core`)

**Objectif :** Ce package agit comme le backend de Qwen Code. Il reçoit les requêtes envoyées depuis `packages/cli`, orchestre les interactions avec l'API du modèle configuré et gère l'exécution des outils disponibles.

**Fonctions principales :**

- **Client API :** Communique avec l'API du modèle Qwen pour envoyer des invites et recevoir des réponses.
- **Construction des invites :** Construit les invites appropriées pour le modèle, en intégrant l'historique des conversations et les définitions des outils disponibles.
- **Enregistrement et exécution des outils :** Gère l'enregistrement des outils disponibles et les exécute selon les demandes du modèle.
- **Gestion de l'état :** Conserve les informations d'état de la conversation et de la session.
- **Configuration côté serveur :** Gère la configuration et les paramètres côté serveur.

### 3. Outils (`packages/core/src/tools/`)

**Objectif :** Il s'agit de modules individuels qui étendent les capacités du modèle Qwen, lui permettant d'interagir avec l'environnement local (par exemple, le système de fichiers, les commandes shell, la récupération web).

**Interaction :** `packages/core` invoque ces outils en fonction des demandes du modèle Qwen.

**Les outils courants incluent :**

- **Opérations sur les fichiers :** Lecture, écriture et modification de fichiers
- **Commandes Shell :** Exécution de commandes système avec approbation de l'utilisateur pour les opérations potentiellement dangereuses
- **Outils de recherche :** Recherche de fichiers et de contenu dans le projet
- **Outils Web :** Récupération de contenu depuis le web
- **Intégration MCP :** Connexion aux serveurs Model Context Protocol pour des capacités étendues

## Flux d'interaction

Une interaction typique avec Qwen Code suit ce flux :

1.  **Entrée utilisateur :** L'utilisateur tape une invite ou une commande dans le terminal, qui est gérée par `packages/cli`.
2.  **Requête vers le cœur :** `packages/cli` envoie l'entrée de l'utilisateur à `packages/core`.
3.  **Traitement de la requête :** Le package principal :
    - Construit une invite appropriée pour l'API du modèle configuré, incluant éventuellement l'historique de conversation et les définitions d'outils disponibles.
    - Envoie l'invite à l'API du modèle.
4.  **Réponse de l'API du modèle :** L'API du modèle traite l'invite et renvoie une réponse. Cette réponse peut être une réponse directe ou une demande d'utilisation de l'un des outils disponibles.
5.  **Exécution de l'outil (le cas échéant) :**
    - Lorsque l'API du modèle demande un outil, le package principal se prépare à l'exécuter.
    - Si l'outil demandé peut modifier le système de fichiers ou exécuter des commandes shell, l'utilisateur reçoit d'abord les détails de l'outil et de ses arguments, et doit approuver l'exécution.
    - Les opérations en lecture seule, telles que la lecture de fichiers, peuvent ne pas nécessiter de confirmation explicite de l'utilisateur pour continuer.
    - Une fois confirmé, ou si aucune confirmation n'est requise, le package principal exécute l'action pertinente au sein de l'outil concerné, et le résultat est renvoyé à l'API du modèle par le package principal.
    - L'API du modèle traite le résultat de l'outil et génère une réponse finale.
6.  **Réponse vers CLI :** Le package principal renvoie la réponse finale au package CLI.
7.  **Affichage à l'utilisateur :** Le package CLI formate et affiche la réponse à l'utilisateur dans le terminal.

## Options de configuration

Qwen Code offre plusieurs façons de configurer son comportement :

### Couches de configuration (par ordre de priorité)

1. Arguments de ligne de commande
2. Variables d'environnement
3. Fichier de paramètres du projet (`.qwen/settings.json`)
4. Fichier de paramètres utilisateur (`~/.qwen/settings.json`)
5. Fichiers de paramètres système
6. Valeurs par défaut

### Catégories de configuration principales

- **Paramètres généraux :** mode vim, éditeur préféré, préférences de mise à jour automatique
- **Paramètres de l'interface utilisateur :** Personnalisation du thème, visibilité de la bannière, affichage du pied de page
- **Paramètres du modèle :** Sélection du modèle, limites de tours de session, paramètres de compression
- **Paramètres de contexte :** Noms des fichiers de contexte, inclusion de répertoires, filtrage des fichiers
- **Paramètres des outils :** Modes d'approbation, sandboxing, restrictions d'outils
- **Paramètres de confidentialité :** Collecte des statistiques d'utilisation
- **Paramètres avancés :** Options de débogage, commandes personnalisées de rapport de bugs

## Principes de conception clés

- **Modularité :** Séparer le CLI (interface utilisateur) du Core (moteur) permet un développement indépendant et des extensions futures potentielles (par exemple, différentes interfaces pour le même moteur).
- **Extensibilité :** Le système d'outils est conçu pour être extensible, permettant l'ajout de nouvelles fonctionnalités via des outils personnalisés ou l'intégration avec un serveur MCP.
- **Expérience utilisateur :** Le CLI vise à fournir une expérience terminale riche et interactive, incluant la coloration syntaxique, des thèmes personnalisables et une structure de commandes intuitive.
- **Sécurité :** Implémente des mécanismes d'approbation pour les opérations potentiellement dangereuses ainsi que des options de bac à sable (sandboxing) afin de protéger le système de l'utilisateur.
- **Flexibilité :** Prend en charge plusieurs méthodes de configuration et peut s'adapter à différents flux de travail et environnements.
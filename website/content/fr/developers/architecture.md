# Aperçu de l'architecture de Qwen Code

Ce document fournit une vue d'ensemble de haut niveau de l'architecture de Qwen Code.

## Composants principaux

Qwen Code est principalement composé de deux packages principaux, ainsi que d'un ensemble d'outils que le système peut utiliser lors du traitement des entrées en ligne de commande :

### 1. Package CLI (`packages/cli`)

**Objectif :** Ce package contient la partie destinée à l'utilisateur de Qwen Code, comme la gestion de la saisie initiale, la présentation du résultat final et la gestion de l'expérience utilisateur globale.

**Fonctions clés :**

- **Traitement des entrées :** Gère les entrées utilisateur via diverses méthodes, y compris la saisie de texte directe, les commandes slash (par exemple, `/help`, `/clear`, `/model`), les commandes at (`@file` pour inclure le contenu d'un fichier) et les commandes avec point d'exclamation (`!command` pour l'exécution de commandes shell).
- **Gestion de l'historique :** Maintient l'historique des conversations et permet des fonctionnalités comme la reprise de session.
- **Rendu d'affichage :** Formate et présente les réponses à l'utilisateur dans le terminal avec une coloration syntaxique et un formatage approprié.
- **Personnalisation du thème et de l'interface :** Prend en charge des thèmes personnalisables et des éléments d'interface pour une expérience personnalisée.
- **Paramètres de configuration :** Gère diverses options de configuration via des fichiers de paramètres JSON, des variables d'environnement et des arguments de ligne de commande.

### 2. Package Core (`packages/core`)

**Objectif :** Ce package agit comme le backend de Qwen Code. Il reçoit les requêtes envoyées depuis `packages/cli`, orchestre les interactions avec l'API du modèle configuré et gère l'exécution des outils disponibles.

**Fonctions clés :**

- **Client API :** Communique avec l'API du modèle Qwen pour envoyer des prompts et recevoir des réponses.
- **Construction du prompt :** Construit les prompts appropriés pour le modèle, en intégrant l'historique de la conversation et les définitions des outils disponibles.
- **Enregistrement et exécution des outils :** Gère l'enregistrement des outils disponibles et les exécute en fonction des requêtes du modèle.
- **Gestion d'état :** Maintient les informations d'état de la conversation et de la session.
- **Configuration côté serveur :** Gère la configuration et les paramètres côté serveur.

### 3. Outils (`packages/core/src/tools/`)

**Objectif :** Ce sont des modules individuels qui étendent les capacités du modèle Qwen, lui permettant d'interagir avec l'environnement local (par exemple, système de fichiers, commandes shell, récupération web).

**Interaction :** `packages/core` invoque ces outils en fonction des requêtes du modèle Qwen.

**Outils courants :**

- **Opérations sur les fichiers :** Lecture, écriture et édition de fichiers
- **Commandes shell :** Exécution de commandes système avec approbation de l'utilisateur pour les opérations potentiellement dangereuses
- **Outils de recherche :** Recherche de fichiers et recherche de contenu dans le projet
- **Outils web :** Récupération de contenu depuis le web
- **Intégration MCP :** Connexion aux serveurs Model Context Protocol pour des capacités étendues

## Flux d'interaction

Une interaction typique avec Qwen Code suit ce flux :

1. **Entrée utilisateur :** L'utilisateur tape un prompt ou une commande dans le terminal, géré par `packages/cli`.
2. **Requête au Core :** `packages/cli` envoie l'entrée utilisateur à `packages/core`.
3. **Traitement de la requête :** Le package core :
    - Construit un prompt approprié pour l'API du modèle configuré, en incluant éventuellement l'historique de la conversation et les définitions des outils disponibles.
    - Envoie le prompt à l'API du modèle.
4. **Réponse de l'API du modèle :** L'API du modèle traite le prompt et renvoie une réponse. Cette réponse peut être une réponse directe ou une demande d'utilisation d'un des outils disponibles.
5. **Exécution d'outil (le cas échéant) :**
    - Lorsque l'API du modèle demande un outil, le package core se prépare à l'exécuter.
    - Si l'outil demandé peut modifier le système de fichiers ou exécuter des commandes shell, l'utilisateur reçoit d'abord les détails de l'outil et de ses arguments, et doit approuver l'exécution.
    - Les opérations en lecture seule, comme la lecture de fichiers, peuvent ne pas nécessiter de confirmation explicite de l'utilisateur pour se poursuivre.
    - Une fois confirmée, ou si la confirmation n'est pas requise, le package core exécute l'action appropriée dans l'outil concerné, et le résultat est renvoyé à l'API du modèle par le package core.
    - L'API du modèle traite le résultat de l'outil et génère une réponse finale.
6. **Réponse au CLI :** Le package core renvoie la réponse finale au package CLI.
7. **Affichage à l'utilisateur :** Le package CLI formate et affiche la réponse à l'utilisateur dans le terminal.

## Options de configuration

Qwen Code offre plusieurs façons de configurer son comportement :

### Couches de configuration (par ordre de priorité)

1. Arguments de ligne de commande
2. Variables d'environnement
3. Fichier de paramètres du projet (`.qwen/settings.json`)
4. Fichier de paramètres utilisateur (`~/.qwen/settings.json`)
5. Fichiers de paramètres système
6. Valeurs par défaut

### Catégories de configuration clés

- **Paramètres généraux :** mode vim, éditeur préféré, préférences de mise à jour automatique
- **Paramètres d'interface utilisateur :** Personnalisation du thème, visibilité de la bannière, affichage du pied de page
- **Paramètres du modèle :** Sélection du modèle, limites de tours de session, paramètres de compression
- **Paramètres de contexte :** Noms de fichiers de contexte, inclusion de répertoires, filtrage de fichiers
- **Paramètres des outils :** Modes d'approbation, sandboxing, restrictions d'outils
- **Paramètres de confidentialité :** Collecte de statistiques d'utilisation
- **Paramètres avancés :** Options de débogage, commandes personnalisées de signalement de bugs

## Principes de conception clés

- **Modularité :** La séparation du CLI (frontend) et du Core (backend) permet un développement indépendant et d'éventuelles extensions futures (par exemple, différents frontends pour le même backend).
- **Extensibilité :** Le système d'outils est conçu pour être extensible, permettant d'ajouter de nouvelles capacités via des outils personnalisés ou l'intégration de serveurs MCP.
- **Expérience utilisateur :** Le CLI se concentre sur la fourniture d'une expérience terminal riche et interactive avec des fonctionnalités comme la coloration syntaxique, des thèmes personnalisables et des structures de commandes intuitives.
- **Sécurité :** Implémente des mécanismes d'approbation pour les opérations potentiellement dangereuses et des options de sandboxing pour protéger le système de l'utilisateur.
- **Flexibilité :** Prend en charge plusieurs méthodes de configuration et peut s'adapter à différents flux de travail et environnements.
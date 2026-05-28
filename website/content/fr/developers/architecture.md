---
description: "Comprenez l’architecture Qwen Code : modules clés, flux de données et limites d’extension pour contribuer, diagnostiquer les bugs et concevoir des features."
---

# Vue d'ensemble de l'architecture de Qwen Code

Ce document présente une vue d'ensemble de l'architecture de Qwen Code.

## Composants principaux

Qwen Code est principalement composé de deux packages principaux, ainsi que d'une suite d'outils que le système peut utiliser lors du traitement des entrées en ligne de commande :

### 1. Package CLI (`packages/cli`)

**Objectif :** Ce package contient la partie visible par l'utilisateur de Qwen Code, notamment la gestion des entrées initiales, l'affichage des résultats finaux et la gestion globale de l'expérience utilisateur.

**Fonctions clés :**

- **Traitement des entrées :** Gère les saisies utilisateur via différentes méthodes, notamment la saisie directe de texte, les commandes slash (ex. `/help`, `/clear`, `/model`), les commandes at (`@file` pour inclure le contenu d'un fichier) et les commandes point d'exclamation (`!command` pour l'exécution shell).
- **Gestion de l'historique :** Conserve l'historique des conversations et permet des fonctionnalités telles que la reprise de session.
- **Rendu d'affichage :** Formate et présente les réponses à l'utilisateur dans le terminal avec la coloration syntaxique et une mise en forme adaptée.
- **Personnalisation du thème et de l'interface :** Prend en charge des thèmes et des éléments d'interface personnalisables pour une expérience sur mesure.
- **Paramètres de configuration :** Gère diverses options de configuration via des fichiers de paramètres JSON, des variables d'environnement et des arguments en ligne de commande.

### 2. Package Core (`packages/core`)

**Objectif :** Ce package agit comme le backend de Qwen Code. Il reçoit les requêtes envoyées par `packages/cli`, orchestre les interactions avec l'API du modèle configuré et gère l'exécution des outils disponibles.

**Fonctions clés :**

- **Client API :** Communique avec l'API du modèle Qwen pour envoyer des prompts et recevoir des réponses.
- **Construction des prompts :** Génère des prompts adaptés pour le modèle, en intégrant l'historique des conversations et les définitions des outils disponibles.
- **Enregistrement et exécution des outils :** Gère l'enregistrement des outils disponibles et les exécute en fonction des requêtes du modèle.
- **Gestion de l'état :** Conserve les informations d'état des conversations et des sessions.
- **Configuration côté serveur :** Gère la configuration et les paramètres côté serveur.

### 3. Outils (`packages/core/src/tools/`)

**Objectif :** Il s'agit de modules individuels qui étendent les capacités du modèle Qwen, lui permettant d'interagir avec l'environnement local (ex. système de fichiers, commandes shell, récupération de contenu web).

**Interaction :** `packages/core` invoque ces outils en fonction des requêtes du modèle Qwen.

**Outils courants :**

- **Opérations sur les fichiers :** Lecture, écriture et modification de fichiers
- **Commandes shell :** Exécution de commandes système avec l'approbation de l'utilisateur pour les opérations potentiellement dangereuses
- **Outils de recherche :** Recherche de fichiers et de contenu au sein du projet
- **Outils web :** Récupération de contenu depuis le web
- **Intégration MCP :** Connexion aux serveurs Model Context Protocol pour des fonctionnalités étendues

## Flux d'interaction

Une interaction typique avec Qwen Code suit le flux suivant :

1.  **Saisie utilisateur :** L'utilisateur tape un prompt ou une commande dans le terminal, géré par `packages/cli`.
2.  **Requête vers le Core :** `packages/cli` envoie la saisie de l'utilisateur à `packages/core`.
3.  **Traitement de la requête :** Le package core :
    - Construit un prompt adapté pour l'API du modèle configuré, en incluant éventuellement l'historique des conversations et les définitions des outils disponibles.
    - Envoie le prompt à l'API du modèle.
4.  **Réponse de l'API du modèle :** L'API du modèle traite le prompt et renvoie une réponse. Cette réponse peut être une réponse directe ou une demande d'utilisation de l'un des outils disponibles.
5.  **Exécution d'outil (le cas échéant) :**
    - Lorsque l'API du modèle demande un outil, le package core se prépare à l'exécuter.
    - Si l'outil demandé peut modifier le système de fichiers ou exécuter des commandes shell, l'utilisateur reçoit d'abord les détails de l'outil et de ses arguments, et doit approuver son exécution.
    - Les opérations en lecture seule, comme la lecture de fichiers, peuvent ne pas nécessiter de confirmation explicite de l'utilisateur pour continuer.
    - Une fois confirmé, ou si aucune confirmation n'est requise, le package core exécute l'action correspondante via l'outil concerné, et le résultat est renvoyé à l'API du modèle par le package core.
    - L'API du modèle traite le résultat de l'outil et génère une réponse finale.
6.  **Réponse vers le CLI :** Le package core renvoie la réponse finale au package CLI.
7.  **Affichage à l'utilisateur :** Le package CLI formate et affiche la réponse à l'utilisateur dans le terminal.

## Options de configuration

Qwen Code propose plusieurs méthodes pour configurer son comportement :

### Couches de configuration (par ordre de priorité)

1. Arguments en ligne de commande
2. Variables d'environnement
3. Fichier de paramètres du projet (`.qwen/settings.json`)
4. Fichier de paramètres utilisateur (`~/.qwen/settings.json`)
5. Fichiers de paramètres système
6. Valeurs par défaut

### Catégories de configuration clés

- **Paramètres généraux :** mode vim, éditeur préféré, préférences de mise à jour automatique
- **Paramètres d'interface :** Personnalisation du thème, visibilité de la bannière, affichage du pied de page
- **Paramètres du modèle :** Sélection du modèle, limites de tours de session, paramètres de compression
- **Paramètres de contexte :** Noms des fichiers de contexte, inclusion de répertoires, filtrage de fichiers
- **Paramètres des outils :** Modes d'approbation, sandboxing, restrictions d'outils
- **Paramètres de confidentialité :** Collecte des statistiques d'utilisation
- **Paramètres avancés :** Options de débogage, commandes personnalisées de signalement de bugs

## Principes de conception clés

- **Modularité :** La séparation du CLI (frontend) et du Core (backend) permet un développement indépendant et de futures extensions potentielles (ex. différents frontends pour un même backend).
- **Extensibilité :** Le système d'outils est conçu pour être extensible, permettant l'ajout de nouvelles fonctionnalités via des outils personnalisés ou l'intégration de serveurs MCP.
- **Expérience utilisateur :** Le CLI se concentre sur la fourniture d'une expérience terminal riche et interactive, avec des fonctionnalités telles que la coloration syntaxique, des thèmes personnalisables et des structures de commandes intuitives.
- **Sécurité :** Met en œuvre des mécanismes d'approbation pour les opérations potentiellement dangereuses et des options de sandboxing pour protéger le système de l'utilisateur.
- **Flexibilité :** Prend en charge plusieurs méthodes de configuration et peut s'adapter à différents workflows et environnements.
# Aperçu de l’architecture de Qwen Code

Ce document fournit un aperçu général de l’architecture de Qwen Code.

## Composants principaux

Qwen Code est principalement constitué de deux packages principaux, ainsi que d’une suite d’outils pouvant être utilisés par le système lors du traitement des entrées en ligne de commande :

### 1. Package CLI (`packages/cli`)

**Objectif :** Ce package contient la partie orientée utilisateur de Qwen Code, notamment le traitement des entrées initiales de l’utilisateur, l’affichage du résultat final et la gestion de l’expérience utilisateur globale.

**Fonctions principales :**

- **Traitement des entrées :** Gère les entrées utilisateur via diverses méthodes, notamment la saisie directe de texte, les commandes avec barre oblique (par exemple `/help`, `/clear`, `/model`), les commandes avec arrobe (`@fichier` pour inclure le contenu d’un fichier) et les commandes avec point d’exclamation (`!commande` pour exécuter une commande shell).
- **Gestion de l’historique :** Conserve l’historique des conversations et permet des fonctionnalités telles que la reprise de session.
- **Rendu de l’affichage :** Met en forme et affiche les réponses à l’utilisateur dans le terminal, avec coloration syntaxique et un formatage adapté.
- **Personnalisation du thème et de l’interface utilisateur :** Prend en charge des thèmes et des éléments d’interface utilisateur personnalisables pour une expérience adaptée aux préférences de l’utilisateur.
- **Paramètres de configuration :** Gère diverses options de configuration via des fichiers JSON, des variables d’environnement et des arguments de ligne de commande.

### 2. Package principal (`packages/core`)

**Objectif :** Ce package constitue le backend de Qwen Code. Il reçoit les requêtes envoyées depuis `packages/cli`, orchestre les interactions avec l’API du modèle configuré et gère l’exécution des outils disponibles.

**Fonctions principales :**

- **Client API :** Communique avec l’API du modèle Qwen pour envoyer des invites (prompts) et recevoir des réponses.
- **Construction des invites :** Génère les invites appropriées pour le modèle, en intégrant l’historique de la conversation et les définitions des outils disponibles.
- **Enregistrement et exécution des outils :** Gère l’enregistrement des outils disponibles et leur exécution en fonction des demandes du modèle.
- **Gestion de l’état :** Conserve les informations d’état relatives à la conversation et à la session.
- **Configuration côté serveur :** Gère la configuration et les paramètres côté serveur.

### 3. Outils (`packages/core/src/tools/`)

**Objectif :** Il s’agit de modules individuels qui étendent les capacités du modèle Qwen, lui permettant d’interagir avec l’environnement local (par exemple, le système de fichiers, les commandes shell, la récupération de contenu depuis le web).

**Interaction :** Le package `packages/core` invoque ces outils en fonction des demandes émises par le modèle Qwen.

**Outils courants :**

- **Opérations sur les fichiers :** Lecture, écriture et édition de fichiers  
- **Commandes shell :** Exécution de commandes système, avec validation explicite de l’utilisateur pour les opérations potentiellement dangereuses  
- **Outils de recherche :** Recherche de fichiers et de contenu au sein du projet  
- **Outils web :** Récupération de contenu depuis le web  
- **Intégration MCP :** Connexion à des serveurs Model Context Protocol afin d’étendre les fonctionnalités

## Flux d’interaction

Une interaction typique avec Qwen Code suit le flux suivant :

1.  **Saisie de l’utilisateur** : L’utilisateur tape une invite ou une commande dans le terminal, géré par le paquet `packages/cli`.
2.  **Requête vers le cœur** : Le paquet `packages/cli` transmet la saisie de l’utilisateur au paquet `packages/core`.
3.  **Traitement de la requête** : Le paquet cœur :
    - Construit une invite adaptée pour l’API du modèle configuré, éventuellement incluant l’historique de la conversation et les définitions des outils disponibles.
    - Envoie cette invite à l’API du modèle.
4.  **Réponse de l’API du modèle** : L’API du modèle traite l’invite et renvoie une réponse. Celle-ci peut être une réponse directe ou une demande d’utilisation de l’un des outils disponibles.
5.  **Exécution d’un outil (le cas échéant)** :
    - Lorsque l’API du modèle demande un outil, le paquet cœur se prépare à son exécution.
    - Si l’outil demandé peut modifier le système de fichiers ou exécuter des commandes shell, l’utilisateur reçoit d’abord les détails concernant cet outil et ses arguments, et doit explicitement approuver son exécution.
    - Les opérations en lecture seule, telles que la lecture de fichiers, peuvent ne pas nécessiter de confirmation explicite de l’utilisateur.
    - Une fois l’exécution confirmée (ou si aucune confirmation n’est requise), le paquet cœur exécute l’action correspondante au sein de l’outil concerné, puis renvoie le résultat à l’API du modèle.
    - L’API du modèle traite ce résultat et génère une réponse finale.
6.  **Réponse au CLI** : Le paquet cœur renvoie la réponse finale au paquet CLI.
7.  **Affichage à l’utilisateur** : Le paquet CLI met en forme la réponse et l’affiche à l’utilisateur dans le terminal.

## Options de configuration

Qwen Code propose plusieurs moyens de configurer son comportement :

### Couches de configuration (par ordre de priorité)

1. Arguments de ligne de commande  
2. Variables d’environnement  
3. Fichier de paramètres du projet (`.qwen/settings.json`)  
4. Fichier de paramètres utilisateur (`~/.qwen/settings.json`)  
5. Fichiers de paramètres système  
6. Valeurs par défaut  

### Catégories principales de configuration

- **Paramètres généraux** : mode Vim, éditeur privilégié, préférences de mise à jour automatique  
- **Paramètres d’interface utilisateur** : personnalisation du thème, affichage de la bannière, affichage du pied de page  
- **Paramètres du modèle** : sélection du modèle, limites de tours de session, paramètres de compression  
- **Paramètres de contexte** : noms des fichiers de contexte, inclusion de répertoires, filtrage des fichiers  
- **Paramètres des outils** : modes d’approbation, isolation (sandboxing), restrictions sur les outils  
- **Paramètres de confidentialité** : collecte de statistiques d’utilisation  
- **Paramètres avancés** : options de débogage, commandes personnalisées de signalement des bogues

## Principes fondamentaux de conception

- **Modularité :** La séparation de l’interface en ligne de commande (frontend) du cœur du système (backend) permet un développement indépendant et des extensions futures potentielles (par exemple, différents frontends pour un même backend).
- **Extensibilité :** Le système d’outils est conçu pour être extensible, ce qui permet d’ajouter de nouvelles fonctionnalités via des outils personnalisés ou l’intégration d’un serveur MCP.
- **Expérience utilisateur :** L’interface en ligne de commande privilégie une expérience riche et interactive dans le terminal, avec des fonctionnalités telles que la coloration syntaxique, des thèmes personnalisables et des structures de commandes intuitives.
- **Sécurité :** Des mécanismes d’approbation sont mis en œuvre pour les opérations potentiellement dangereuses, ainsi que des options de bac à sable afin de protéger le système de l’utilisateur.
- **Flexibilité :** Prend en charge plusieurs méthodes de configuration et peut s’adapter à divers flux de travail et environnements.
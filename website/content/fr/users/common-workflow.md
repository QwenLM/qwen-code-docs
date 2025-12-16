# Flux de travail courants

> Découvrez les flux de travail courants avec Qwen Code.

Chaque tâche dans ce document inclut des instructions claires, des exemples de commandes et des bonnes pratiques pour vous aider à tirer le meilleur parti de Qwen Code.

## Comprendre de nouvelles bases de code

### Obtenir un aperçu rapide d'une base de code

Supposons que vous veniez de rejoindre un nouveau projet et que vous devez comprendre rapidement sa structure.

**1. Accédez au répertoire racine du projet**

```bash
cd /path/to/project
```

**2. Démarrez Qwen Code**

```bash
qwen
```

**3. Demandez un aperçu général**

```
give me an overview of this codebase
```

**4. Approfondissez des composants spécifiques**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - Commencez par des questions générales, puis concentrez-vous sur des domaines spécifiques
> - Interrogez-vous sur les conventions et les modèles de codage utilisés dans le projet
> - Demandez un glossaire des termes spécifiques au projet

### Trouver du code pertinent

Supposons que vous devez localiser le code lié à une fonctionnalité ou caractéristique spécifique.

**1. Demander à Qwen Code de trouver les fichiers pertinents**

```
trouver les fichiers qui gèrent l'authentification des utilisateurs
```

**2. Obtenir le contexte sur la façon dont les composants interagissent**

```
comment ces fichiers d'authentification fonctionnent-ils ensemble ?
```

**3. Comprendre le flux d'exécution**

```
tracer le processus de connexion depuis le front-end jusqu'à la base de données
```

> [!tip]
>
> - Soyez précis sur ce que vous recherchez
> - Utilisez le langage propre au domaine du projet

## Corriger les bugs efficacement

Supposons que vous avez rencontré un message d'erreur et que vous devez trouver et corriger sa source.

**1. Partager l'erreur avec Qwen Code**

```
J'obtiens une erreur quand j'exécute npm test
```

**2. Demander des recommandations de correction**

```
suggère plusieurs façons de corriger le @ts-ignore dans user.ts
```

**3. Appliquer la correction**

```
met à jour user.ts pour ajouter la vérification null que tu as suggérée
```

> [!tip]
>
> - Indiquez à Qwen Code la commande permettant de reproduire le problème et obtenir une trace d'appel
> - Mentionnez toutes les étapes nécessaires pour reproduire l'erreur
> - Informez Qwen Code si l'erreur est intermittente ou systématique

## Refactoriser le code

Supposons que vous devez mettre à jour l'ancien code pour utiliser des modèles et des pratiques modernes.

**1. Identifier le code hérité à refactoriser**

```
trouver l'utilisation d'API dépréciées dans notre base de code
```

**2. Obtenir des recommandations de refactorisation**

```
suggérer comment refactoriser utils.js pour utiliser les fonctionnalités JavaScript modernes
```

**3. Appliquer les changements en toute sécurité**

```
refactoriser utils.js pour utiliser les fonctionnalités ES 2024 tout en conservant le même comportement
```

**4. Vérifier la refactorisation**

```
exécuter les tests pour le code refactorisé
```

> [!tip]
>
> - Demander à Qwen Code d'expliquer les avantages de l'approche moderne
> - Exiger que les modifications maintiennent la compatibilité ascendante lorsque cela est nécessaire
> - Réaliser la refactorisation par petits incréments testables

## Utiliser des sous-agents spécialisés

Supposons que vous souhaitiez utiliser des sous-agents IA spécialisés pour gérer des tâches spécifiques de manière plus efficace.

**1. Voir les sous-agents disponibles**

```
/agents
```

Cela affiche tous les sous-agents disponibles et vous permet d'en créer de nouveaux.

**2. Utiliser automatiquement les sous-agents**

Qwen Code délègue automatiquement les tâches appropriées aux sous-agents spécialisés :

```
examiner mes dernières modifications de code pour détecter des problèmes de sécurité
```

```
exécuter tous les tests et corriger les échecs
```

**3. Demander explicitement des sous-agents spécifiques**

```
utiliser le sous-agent code-reviewer pour vérifier le module d'authentification
```

```
demander au sous-agent debugger d'enquêter sur pourquoi les utilisateurs ne peuvent pas se connecter
```

**4. Créer des sous-agents personnalisés pour votre flux de travail**

```
/agents
```

Ensuite, sélectionnez « create » et suivez les instructions pour définir :

- Un identifiant unique décrivant l'objectif du sous-agent (par exemple, `code-reviewer`, `api-designer`)
- Quand Qwen Code doit utiliser cet agent
- Quels outils il peut accéder
- Une invite système décrivant le rôle et le comportement de l’agent

> [!tip]
>
> - Créez des sous-agents spécifiques à un projet dans `.qwen/agents/` pour les partager avec votre équipe
> - Utilisez des champs `description` explicites afin d’activer la délégation automatique
> - Limitez l’accès aux outils à ce dont chaque sous-agent a réellement besoin
> - En savoir plus sur les [sous-agents](/users/features/sub-agents)
> - En savoir plus sur le [mode d’approbation](/users/features/approval-mode)

## Travailler avec les tests

Supposons que vous devez ajouter des tests pour du code non couvert.

**1. Identifier le code non testé**

```
trouver les fonctions dans NotificationsService.swift qui ne sont pas couvertes par des tests
```

**2. Générer le squelette des tests**

```
ajouter des tests pour le service de notifications
```

**3. Ajouter des cas de test significatifs**

```
ajouter des cas de test pour les conditions limites dans le service de notifications
```

**4. Exécuter et vérifier les tests**

```
exécuter les nouveaux tests et corriger les éventuels échecs
```

Qwen Code peut générer des tests qui suivent les modèles et conventions existants de votre projet. Lorsque vous demandez des tests, soyez précis sur le comportement que vous souhaitez vérifier. Qwen Code examine vos fichiers de test existants pour s'adapter au style, aux frameworks et aux modèles d'assertion déjà utilisés.

Pour une couverture complète, demandez à Qwen Code d'identifier les cas limites que vous pourriez avoir manqués. Qwen Code peut analyser vos chemins de code et suggérer des tests pour les conditions d'erreur, les valeurs limites et les entrées inattendues qui sont faciles à négliger.

## Créer des pull requests

Supposons que vous devez créer une pull request bien documentée pour vos modifications.

**1. Résumer vos changements**

```
résumer les modifications que j'ai apportées au module d'authentification
```

**2. Générer une pull request avec Qwen Code**

```
créer une pr
```

**3. Réviser et affiner**

```
améliorer la description de la PR avec plus de contexte sur les améliorations de sécurité
```

**4. Ajouter des détails sur les tests**

```
ajouter des informations sur la façon dont ces modifications ont été testées
```

> [!tip]
>
> - Demandez directement à Qwen Code de créer une PR pour vous
> - Révisez la PR générée par Qwen Code avant de la soumettre
> - Demandez à Qwen Code de mettre en évidence les risques potentiels ou les points de vigilance

## Gérer la documentation

Supposons que vous devez ajouter ou mettre à jour la documentation de votre code.

**1. Identifier le code non documenté**

```
trouver les fonctions sans commentaires JSDoc appropriés dans le module d'authentification
```

**2. Générer la documentation**

```
ajouter des commentaires JSDoc aux fonctions non documentées dans auth.js
```

**3. Réviser et améliorer**

```
améliorer la documentation générée avec plus de contexte et d'exemples
```

**4. Vérifier la documentation**

```
vérifier si la documentation suit nos normes de projet
```

> [!tip]
>
> - Spécifiez le style de documentation souhaité (JSDoc, docstrings, etc.)
> - Demandez des exemples dans la documentation
> - Sollicitez une documentation pour les API publiques, les interfaces et la logique complexe

## Référencer des fichiers et répertoires

Utilisez `@` pour inclure rapidement des fichiers ou des répertoires sans attendre que Qwen Code les lise.

**1. Référencer un seul fichier**

```
Explique la logique dans @src/utils/auth.js
```

Cela inclut le contenu complet du fichier dans la conversation.

**2. Référencer un répertoire**

```
Quelle est la structure de @src/components ?
```

Cela fournit un listing du répertoire avec les informations sur les fichiers.

**3. Référencer des ressources MCP**

```
Montre-moi les données de @github : repos/owner/repo/issues
```

Cela récupère les données depuis les serveurs MCP connectés en utilisant le format @serveur : ressource. Voir [MCP](/users/features/mcp) pour plus de détails.

> [!tip]
>
> - Les chemins de fichiers peuvent être relatifs ou absolus
> - Les références de fichiers avec @ ajoutent `QWEN.md` dans le répertoire du fichier et ses répertoires parents au contexte
> - Les références de répertoires affichent les listes de fichiers, pas leur contenu
> - Vous pouvez référencer plusieurs fichiers dans un seul message (par exemple, "`@fichier1.js` et `@fichier2.js`")

## Reprendre les conversations précédentes

Supposons que vous ayez travaillé sur une tâche avec Qwen Code et que vous souhaitiez reprendre là où vous vous êtes arrêté lors d'une session ultérieure.

Qwen Code propose deux options pour reprendre les conversations précédentes :

- `--continue` pour reprendre automatiquement la conversation la plus récente
- `--resume` pour afficher un sélecteur de conversation

**1. Reprendre la conversation la plus récente**

```bash
qwen --continue
```

Cela reprend immédiatement votre conversation la plus récente sans aucune invite.

**2. Reprendre en mode non interactif**

```bash
qwen --continue --p "Continue with my task"
```

Utilisez `--print` avec `--continue` pour reprendre la conversation la plus récente en mode non interactif, parfait pour les scripts ou l'automatisation.

**3. Afficher le sélecteur de conversation**

```bash
qwen --resume
```

Cela affiche un sélecteur de conversation interactif avec une vue en liste claire montrant :

- Résumé de la session (ou invite initiale)
- Métadonnées : temps écoulé, nombre de messages et branche git

Utilisez les flèches pour naviguer et appuyez sur Entrée pour sélectionner une conversation. Appuyez sur Échap pour quitter.

> [!tip]
>
> - L'historique des conversations est stocké localement sur votre machine
> - Utilisez `--continue` pour accéder rapidement à votre conversation la plus récente
> - Utilisez `--resume` lorsque vous devez sélectionner une conversation passée spécifique
> - Lorsque vous reprenez, vous verrez l'historique complet de la conversation avant de continuer
> - La conversation reprise démarre avec le même modèle et la même configuration que l'originale
>
> **Comment cela fonctionne** :
>
> 1. **Stockage des conversations** : Toutes les conversations sont automatiquement enregistrées localement avec leur historique complet de messages
> 2. **Désérialisation des messages** : Lors de la reprise, l'historique complet des messages est restauré pour maintenir le contexte
> 3. **État des outils** : L'utilisation des outils et les résultats de la conversation précédente sont conservés
> 4. **Restauration du contexte** : La conversation reprend avec tout le contexte précédent intact
>
> **Exemples** :
>
> ```bash
> # Continuer la conversation la plus récente
> qwen --continue
>
> # Continuer la conversation la plus récente avec une invite spécifique
> qwen --continue --p "Montre-moi nos progrès"
>
> # Afficher le sélecteur de conversation
> qwen --resume
>
> # Continuer la conversation la plus récente en mode non interactif
> qwen --continue --p "Exécute les tests à nouveau"
> ```

## Exécuter des sessions Qwen Code parallèles avec des arborescences de travail Git

Supposons que vous deviez travailler sur plusieurs tâches simultanément avec une isolation complète du code entre les instances Qwen Code.

**1. Comprendre les arborescences de travail Git**

Les arborescences de travail Git vous permettent d'extraire plusieurs branches du même dépôt dans des répertoires séparés. Chaque arborescence de travail possède son propre répertoire de travail avec des fichiers isolés, tout en partageant le même historique Git. En savoir plus dans la [documentation officielle de Git worktree](https://git-scm.com/docs/git-worktree).

**2. Créer une nouvelle arborescence de travail**

```bash

# Créer une nouvelle arborescence de travail avec une nouvelle branche
git worktree add ../project-feature-a -b feature-a

# Ou créer une arborescence de travail avec une branche existante
git worktree add ../project-bugfix bugfix-123
```

Cela crée un nouveau répertoire avec une copie de travail séparée de votre dépôt.

**3. Exécuter Qwen Code dans chaque arborescence de travail**

```bash

# Naviguer vers votre arborescence de travail
cd ../project-feature-a

# Exécuter le code Qwen dans cet environnement isolé
qwen
```

**4. Exécuter le code Qwen dans un autre arbre de travail**

```bash
cd ../project-bugfix
qwen
```

**5. Gérer vos arbres de travail**

```bash

# Lister tous les arbres de travail
git worktree list

# Supprimer un worktree une fois terminé
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Chaque worktree possède son propre état de fichiers indépendant, ce qui le rend parfait pour des sessions parallèles de Qwen Code
> - Les modifications effectuées dans un worktree n'affectent pas les autres, évitant ainsi les interférences entre instances de Qwen Code
> - Tous les worktrees partagent le même historique Git et les mêmes connexions distantes
> - Pour les tâches de longue durée, vous pouvez faire travailler Qwen Code dans un worktree pendant que vous continuez le développement dans un autre
> - Utilisez des noms de répertoires explicites pour identifier facilement la tâche associée à chaque worktree
> - N'oubliez pas d'initialiser votre environnement de développement dans chaque nouveau worktree selon la configuration de votre projet. Selon votre stack, cela peut inclure :
>   - Projets JavaScript : Exécution de l'installation des dépendances (`npm install`, `yarn`)
>   - Projets Python : Configuration d'environnements virtuels ou installation via des gestionnaires de paquets
>   - Autres langages : Suivre le processus standard d'installation de votre projet

## Utiliser Qwen Code comme un utilitaire de style Unix

### Ajouter Qwen Code à votre processus de vérification

Supposons que vous souhaitiez utiliser Qwen Code comme un linter ou un outil de revue de code.

**Ajoutez Qwen Code à votre script de build :**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - Utilisez Qwen Code pour la revue de code automatisée dans votre pipeline CI/CD
> - Personnalisez le prompt pour vérifier des problèmes spécifiques liés à votre projet
> - Envisagez de créer plusieurs scripts pour différents types de vérifications

### Pipe d'entrée, pipe de sortie

Supposons que vous souhaitiez diriger des données vers Qwen Code et obtenir des données en retour dans un format structuré.

**Diriger des données via Qwen Code :**

```bash
cat build-error.txt | qwen -p 'explique de manière concise la cause profonde de cette erreur de build' > output.txt
```

> [!tip]
>
> - Utilisez des pipes pour intégrer Qwen-Code dans des scripts shell existants
> - Combinez avec d'autres outils Unix pour des flux de travail puissants
> - Envisagez d'utiliser --output-format pour une sortie structurée

### Contrôler le format de sortie

Supposons que vous ayez besoin que la sortie de Qwen Code soit dans un format spécifique, surtout lorsque vous intégrez Qwen Code dans des scripts ou d'autres outils.

**1. Utiliser le format texte (par défaut)**

```bash
cat data.txt | qwen -p 'résumer ces données' --output-format text > summary.txt
```

Cela affiche uniquement la réponse en texte brut de Qwen Code (comportement par défaut).

**2. Utiliser le format JSON**

```bash
cat code.py | qwen -p 'analyser ce code pour détecter des bogues' --output-format json > analysis.json
```

Cela affiche un tableau JSON de messages avec des métadonnées incluant le coût et la durée.

**3. Utiliser le format JSON en flux continu**

```bash
cat log.txt | qwen -p 'analyser ce fichier journal pour les erreurs' --output-format stream-json
```

Cela affiche une série d'objets JSON en temps réel pendant que Qwen Code traite la requête. Chaque message est un objet JSON valide, mais la totalité de la sortie n'est pas un JSON valide si elle est concaténée.

> [!tip]
>
> - Utilisez `--output-format text` pour des intégrations simples où vous avez seulement besoin de la réponse de Qwen Code
> - Utilisez `--output-format json` quand vous avez besoin du journal complet de la conversation
> - Utilisez `--output-format stream-json` pour une sortie en temps réel de chaque tour de conversation

## Poser des questions à Qwen Code sur ses capacités

Qwen Code dispose d'un accès intégré à sa documentation et peut répondre aux questions concernant ses propres fonctionnalités et limites.

### Exemples de questions

```
Qwen Code peut-il créer des pull requests ?
```

```
comment Qwen Code gère-t-il les autorisations ?
```

```
quelles commandes slash sont disponibles ?
```

```
comment utiliser MCP avec Qwen Code ?
```

```
comment configurer Qwen Code pour Amazon Bedrock ?
```

```
quelles sont les limites de Qwen Code ?
```

> [!note]
>
> Qwen Code fournit des réponses basées sur la documentation pour ces questions. Pour des exemples exécutables et des démonstrations pratiques, reportez-vous aux sections spécifiques des workflows ci-dessus.

> [!tip]
>
> - Qwen Code a toujours accès à la dernière documentation de Qwen Code, quelle que soit la version que vous utilisez
> - Posez des questions précises pour obtenir des réponses détaillées
> - Qwen Code peut expliquer des fonctionnalités complexes telles que l'intégration MCP, les configurations d'entreprise et les workflows avancés
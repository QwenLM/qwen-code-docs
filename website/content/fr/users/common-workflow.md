# Flux de travail courants

> Découvrez les flux de travail courants avec Qwen Code.

Chaque tâche décrite dans ce document inclut des instructions claires, des exemples de commandes et des bonnes pratiques pour vous permettre d’exploiter pleinement Qwen Code.

## Comprendre de nouvelles bases de code

### Obtenir un aperçu rapide de la base de code

Supposons que vous venez de rejoindre un nouveau projet et que vous devez rapidement en comprendre la structure.

**1. Accédez au répertoire racine du projet**

```bash
cd /chemin/vers/projet
```

**2. Lancez Qwen Code**

```bash
qwen
```

**3. Demandez un aperçu général de haut niveau**

```
donnez-moi un aperçu général de cette base de code
```

**4. Approfondissez des composants spécifiques**

```
expliquez les principaux motifs architecturaux utilisés ici
```

```
quels sont les modèles de données clés ?
```

```
comment l’authentification est-elle gérée ?
```

> [!tip]
>
> - Commencez par des questions générales, puis affinez progressivement vers des domaines spécifiques  
> - Interrogez-vous sur les conventions de codage et les motifs utilisés dans le projet  
> - Demandez un glossaire des termes propres au projet

### Rechercher le code pertinent

Supposez que vous devez localiser le code lié à une fonctionnalité ou à une capacité spécifique.

**1. Demandez à Qwen Code de trouver les fichiers pertinents**

```
recherchez les fichiers qui gèrent l’authentification des utilisateurs
```

**2. Obtenez du contexte sur les interactions entre composants**

```
comment ces fichiers d’authentification interagissent-ils entre eux ?
```

**3. Comprenez le flux d’exécution**

```
tracez le processus de connexion, depuis le front-end jusqu’à la base de données
```

> [!tip]
>
> - Soyez précis sur ce que vous recherchez  
> - Utilisez le vocabulaire métier propre au projet

## Corrigez les bogues efficacement

Supposez que vous avez rencontré un message d’erreur et que vous devez en trouver la source pour la corriger.

**1. Partagez l’erreur avec Qwen Code**

```
J’obtiens une erreur lorsque j’exécute npm test
```

**2. Demandez des recommandations de correction**

```
suggérez quelques façons de corriger l’instruction @ts-ignore dans user.ts
```

**3. Appliquez la correction**

```
mettez à jour user.ts pour ajouter la vérification de null que vous avez suggérée
```

> [!tip]
>
> - Indiquez à Qwen Code la commande permettant de reproduire le problème afin d’obtenir une trace de la pile d’appels (stack trace)
> - Mentionnez toutes les étapes nécessaires pour reproduire l’erreur
> - Précisez à Qwen Code si l’erreur est intermittente ou systématique

## Refactoriser le code

Supposez que vous devez mettre à jour un ancien code afin d’utiliser des modèles et des bonnes pratiques modernes.

**1. Identifier le code obsolète à refactoriser**

```
rechercher les utilisations d’API dépréciées dans notre base de code
```

**2. Obtenir des recommandations de refactoring**

```
suggérer comment refactoriser utils.js pour utiliser les fonctionnalités modernes de JavaScript
```

**3. Appliquer les modifications en toute sécurité**

```
refactoriser utils.js pour utiliser les fonctionnalités ES 2024 tout en conservant le même comportement
```

**4. Vérifier le refactoring**

```
exécuter les tests sur le code refactorisé
```

> [!tip]
>
> - Demandez à Qwen Code d’expliquer les avantages de l’approche moderne  
> - Demandez que les modifications préservent la compatibilité ascendante lorsque cela est nécessaire  
> - Effectuez le refactoring par petites étapes testables

## Utiliser des sous-agents spécialisés

Supposez que vous souhaitez utiliser des sous-agents IA spécialisés pour traiter des tâches spécifiques de manière plus efficace.

**1. Afficher les sous-agents disponibles**

```
/agents
```

Cela affiche tous les sous-agents disponibles et vous permet d’en créer de nouveaux.

**2. Utiliser les sous-agents automatiquement**

Qwen Code délègue automatiquement les tâches appropriées à des sous-agents spécialisés :

```
analyser mes modifications récentes de code à la recherche de problèmes de sécurité
```

```
exécuter tous les tests et corriger les échecs éventuels
```

**3. Demander explicitement l’utilisation de sous-agents spécifiques**

```
utiliser le sous-agent « code-reviewer » pour vérifier le module d’authentification
```

```
demander au sous-agent « debugger » d’investiguer pourquoi les utilisateurs ne parviennent pas à se connecter
```

**4. Créer des sous-agents personnalisés pour votre flux de travail**

```
/agents
```

Ensuite, sélectionnez « créer » et suivez les invites pour définir :

- Un identifiant unique décrivant la finalité du sous-agent (par exemple, `code-reviewer`, `api-designer`).
- Le moment où Qwen Code doit utiliser cet agent.
- Les outils auxquels il peut accéder.
- Une instruction système décrivant le rôle et le comportement de l’agent.

> [!tip]
>
> - Créez des sous-agents spécifiques à un projet dans le dossier `.qwen/agents/` pour les partager avec votre équipe.
> - Utilisez des champs `description` explicites afin de permettre une délégation automatique.
> - Restreignez l’accès aux outils aux seuls outils réellement nécessaires à chaque sous-agent.
> - En savoir plus sur les [Sous-agents](./features/sub-agents)
> - En savoir plus sur le [Mode d’approbation](./features/approval-mode)

## Travailler avec les tests

Supposez que vous devez ajouter des tests pour du code non couvert.

**1. Identifier le code non testé**

```
rechercher les fonctions dans NotificationsService.swift qui ne sont pas couvertes par des tests
```

**2. Générer une structure de test**

```
ajouter des tests pour le service de notifications
```

**3. Ajouter des cas de test significatifs**

```
ajouter des cas de test pour les conditions limites dans le service de notifications
```

**4. Exécuter et vérifier les tests**

```
exécuter les nouveaux tests et corriger les échecs éventuels
```

Qwen Code peut générer des tests conformes aux modèles et conventions existants de votre projet. Lorsque vous demandez des tests, soyez précis sur le comportement que vous souhaitez vérifier. Qwen Code analyse vos fichiers de tests existants afin de reproduire le style, les frameworks et les motifs d’assertions déjà utilisés.

Pour une couverture exhaustive, demandez à Qwen Code d’identifier les cas limites que vous auriez pu oublier. Qwen Code peut analyser les chemins d’exécution de votre code et suggérer des tests pour les conditions d’erreur, les valeurs aux limites et les entrées inattendues, souvent négligées.

## Créer des demandes de tirage (pull requests)

Supposez que vous devez créer une demande de tirage bien documentée pour vos modifications.

**1. Résumez vos modifications**

```
résumer les modifications que j’ai apportées au module d’authentification
```

**2. Générez une demande de tirage avec Qwen Code**

```
créer une demande de tirage
```

**3. Examinez et affinez**

```
améliorer la description de la demande de tirage en y ajoutant davantage de contexte sur les améliorations de sécurité
```

**4. Ajoutez les détails relatifs aux tests**

```
ajouter des informations sur la manière dont ces modifications ont été testées
```

> [!tip]
>
> - Demandez directement à Qwen Code de créer une demande de tirage pour vous
> - Examinez la demande de tirage générée par Qwen Code avant de la soumettre
> - Demandez à Qwen Code de mettre en évidence les risques ou considérations potentiels

## Gérer la documentation

Supposez que vous devez ajouter ou mettre à jour la documentation de votre code.

**1. Identifier le code non documenté**

```
rechercher les fonctions du module auth qui ne possèdent pas de commentaires JSDoc appropriés
```

**2. Générer la documentation**

```
ajouter des commentaires JSDoc aux fonctions non documentées dans auth.js
```

**3. Examiner et améliorer**

```
améliorer la documentation générée en y ajoutant davantage de contexte et d’exemples
```

**4. Vérifier la documentation**

```
vérifier si la documentation respecte les normes de notre projet
```

> [!tip]
>
> - Précisez le style de documentation souhaité (JSDoc, docstrings, etc.)
> - Demandez des exemples dans la documentation
> - Sollicitez la documentation des API publiques, des interfaces et de la logique complexe

## Fichiers et répertoires de référence

Utilisez `@` pour inclure rapidement des fichiers ou des répertoires sans attendre que Qwen Code les lise.

**1. Référencer un seul fichier**

```
Expliquez la logique dans @src/utils/auth.js
```

Cela inclut l’intégralité du contenu du fichier dans la conversation.

**2. Référencer un répertoire**

```
Quelle est la structure de @src/components ?
```

Cela fournit une liste du répertoire avec les informations relatives aux fichiers.

**3. Référencer des ressources MCP**

```
Montrez-moi les données provenant de @github: repos/owner/repo/issues
```

Cela récupère des données depuis les serveurs MCP connectés, en utilisant le format `@serveur: ressource`. Pour plus de détails, consultez [MCP](./features/mcp).

> [!tip]
>
> - Les chemins de fichiers peuvent être relatifs ou absolus.
> - Les références de fichiers avec `@` ajoutent le fichier `QWEN.md` présent dans le répertoire du fichier ainsi que dans ses répertoires parents au contexte.
> - Les références à des répertoires affichent une liste des fichiers, mais pas leur contenu.
> - Vous pouvez référencer plusieurs fichiers dans un seul message (par exemple, « `@fichier1.js` et `@fichier2.js` »).

## Reprise des conversations précédentes

Supposez que vous avez travaillé sur une tâche avec Qwen Code et que vous devez reprendre là où vous vous étiez arrêté lors d’une session ultérieure.

Qwen Code propose deux options pour reprendre des conversations antérieures :

- `--continue` pour reprendre automatiquement la conversation la plus récente ;
- `--resume` pour afficher un sélecteur de conversations.

**1. Reprendre la conversation la plus récente**

```bash
qwen --continue
```

Cela reprend immédiatement votre conversation la plus récente, sans aucune invite.

**2. Reprendre en mode non interactif**

```bash
qwen --continue --p "Reprends ma tâche"
```

Utilisez `--print` avec `--continue` pour reprendre la conversation la plus récente en mode non interactif — idéal pour les scripts ou l’automatisation.

**3. Afficher le sélecteur de conversations**

```bash
qwen --resume
```

Cela affiche un sélecteur interactif de conversations, sous forme d’une liste claire présentant :

- Le résumé de la session (ou l’invite initiale) ;
- Les métadonnées : durée écoulée, nombre de messages et branche Git.

Utilisez les flèches pour naviguer et appuyez sur Entrée pour sélectionner une conversation. Appuyez sur Échap pour quitter.

> [!tip]
>
> - L’historique des conversations est stocké localement sur votre machine.
> - Utilisez `--continue` pour accéder rapidement à votre conversation la plus récente.
> - Utilisez `--resume` lorsque vous devez sélectionner une conversation passée spécifique.
> - Lors de la reprise, vous visualisez l’intégralité de l’historique de la conversation avant de poursuivre.
> - La conversation reprise démarre avec le même modèle et la même configuration que l’originale.
>
> **Fonctionnement** :
>
> 1. **Stockage des conversations** : Toutes les conversations sont automatiquement sauvegardées localement, avec leur historique complet de messages.
> 2. **Désérialisation des messages** : Lors de la reprise, l’intégralité de l’historique des messages est restaurée afin de conserver le contexte.
> 3. **État des outils** : L’utilisation des outils et leurs résultats issus de la conversation précédente sont préservés.
> 4. **Restauration du contexte** : La conversation reprend avec l’ensemble du contexte précédent intact.
>
> **Exemples** :
>
> ```bash
> # Reprendre la conversation la plus récente
> qwen --continue
>
> # Reprendre la conversation la plus récente avec une invite spécifique
> qwen --continue --p "Montre-moi notre progression"
>
> # Afficher le sélecteur de conversations
> qwen --resume
>
> # Reprendre la conversation la plus récente en mode non interactif
> qwen --continue --p "Relance les tests"
> ```

## Exécuter des sessions parallèles de Qwen Code avec des worktrees Git

Supposez que vous devez travailler simultanément sur plusieurs tâches, avec une isolation complète du code entre les instances de Qwen Code.

**1. Comprendre les worktrees Git**

Les worktrees Git vous permettent de récupérer plusieurs branches d’un même dépôt dans des répertoires distincts. Chaque worktree possède son propre répertoire de travail avec des fichiers isolés, tout en partageant l’historique Git commun. Pour en savoir plus, consultez la [documentation officielle sur `git worktree`](https://git-scm.com/docs/git-worktree).

**2. Créer une nouvelle worktree**

```bash

# Créer une nouvelle worktree avec une nouvelle branche
git worktree add ../project-feature-a -b feature-a

# Ou créer une worktree à partir d’une branche existante
git worktree add ../project-bugfix bugfix-123
```

Cela crée un nouveau répertoire contenant une copie de travail séparée de votre dépôt.

**3. Exécuter Qwen Code dans chaque worktree**

```bash

# Accédez à votre worktree
cd ../project-feature-a

# Exécuter Qwen Code dans cet environnement isolé  
qwen  

**4. Exécuter Qwen Code dans un autre worktree**  

```bash  
cd ../project-bugfix  
qwen  
```  

**5. Gérer vos worktrees**  

```bash  

# Lister tous les worktrees  
git worktree list

# Supprimer un worktree une fois terminé
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Chaque worktree possède son propre état de fichiers indépendant, ce qui le rend idéal pour des sessions parallèles de Qwen Code.
> - Les modifications apportées dans un worktree n’affectent pas les autres, empêchant ainsi les instances de Qwen Code de s’interférer mutuellement.
> - Tous les worktrees partagent la même historique Git et les mêmes connexions distantes.
> - Pour les tâches longues, vous pouvez laisser Qwen Code travailler dans un worktree tandis que vous poursuivez le développement dans un autre.
> - Utilisez des noms de répertoires descriptifs afin d’identifier facilement la tâche associée à chaque worktree.
> - N’oubliez pas d’initialiser votre environnement de développement dans chaque nouveau worktree selon la procédure de configuration de votre projet. Selon votre pile technique, cela peut inclure :
>   - Projets JavaScript : installation des dépendances (`npm install`, `yarn`)
>   - Projets Python : configuration d’environnements virtuels ou installation via des gestionnaires de paquets
>   - Autres langages : suivez la procédure standard de configuration de votre projet

## Utiliser Qwen Code comme un outil au style Unix

### Intégrer Qwen Code à votre processus de vérification

Supposons que vous souhaitiez utiliser Qwen Code comme un linter ou un relecteur de code.

**Ajoutez Qwen Code à votre script de build :**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'Vous êtes un linter. Veuillez examiner les modifications par rapport à la branche principale (main) et signaler tout problème lié aux fautes de frappe. Indiquez le nom du fichier et le numéro de ligne sur une première ligne, puis une description du problème sur une deuxième ligne. Ne renvoyez aucun autre texte.'"
    }
}
```

> [!tip]
>
> - Utilisez Qwen Code pour des revues de code automatisées dans votre pipeline CI/CD  
> - Personnalisez l’invite (prompt) afin de détecter des problèmes spécifiques pertinents pour votre projet  
> - Envisagez de créer plusieurs scripts pour différents types de vérification

### Entrée et sortie par tube (pipe)

Supposez que vous souhaitez transmettre des données à Qwen Code via un tube (pipe) et récupérer des données dans un format structuré.

**Transmettre des données à Qwen Code via un tube :**

```bash
cat build-error.txt | qwen -p 'expliquez brièvement la cause première de cette erreur de compilation' > output.txt
```

> [!tip]
>
> - Utilisez les tubes (pipes) pour intégrer Qwen Code dans vos scripts shell existants.
> - Associez-le à d’autres outils Unix pour créer des flux de travail puissants.
> - Envisagez d’utiliser l’option `--output-format` pour obtenir une sortie structurée.

### Contrôler le format de sortie

Supposez que vous avez besoin de la sortie de Qwen Code dans un format spécifique, notamment lorsqu’il est intégré à des scripts ou à d’autres outils.

**1. Utiliser le format texte (par défaut)**

```bash
cat data.txt | qwen -p 'résumer ces données' --output-format text > summary.txt
```

Cela produit uniquement la réponse en texte brut de Qwen Code (comportement par défaut).

**2. Utiliser le format JSON**

```bash
cat code.py | qwen -p 'analyser ce code à la recherche de bogues' --output-format json > analysis.json
```

Cela produit un tableau JSON de messages accompagnés de métadonnées, notamment le coût et la durée.

**3. Utiliser le format JSON en diffusion continue (streaming)**

```bash
cat log.txt | qwen -p 'analyser ce fichier journal à la recherche d’erreurs' --output-format stream-json
```

Cela produit une série d’objets JSON en temps réel, au fur et à mesure que Qwen Code traite la demande. Chaque message est un objet JSON valide, mais l’ensemble de la sortie n’est pas un JSON valide si les objets sont concaténés.

> [!tip]
>
> - Utilisez `--output-format text` pour des intégrations simples où vous avez uniquement besoin de la réponse de Qwen Code.
> - Utilisez `--output-format json` lorsque vous avez besoin de l’intégralité du journal de conversation.
> - Utilisez `--output-format stream-json` pour obtenir en temps réel la sortie de chaque tour de la conversation.

## Demandez à Qwen Code quelles sont ses capacités

Qwen Code dispose d’un accès intégré à sa propre documentation et peut répondre à des questions sur ses fonctionnalités et ses limites.

### Exemples de questions

```
Qwen Code peut-il créer des pull requests ?
```

```
Comment Qwen Code gère-t-il les autorisations ?
```

```
Quelles commandes avec barre oblique sont disponibles ?
```

```
Comment utiliser MCP avec Qwen Code ?
```

```
Comment configurer Qwen Code pour Amazon Bedrock ?
```

```
Quelles sont les limites de Qwen Code ?
```

> [!note]
>
> Qwen Code fournit des réponses fondées sur sa documentation pour ces questions. Pour des exemples exécutables et des démonstrations pratiques, reportez-vous aux sections de flux de travail spécifiques ci-dessus.

> [!tip]
>
> - Qwen Code a toujours accès à la documentation la plus récente de Qwen Code, quelle que soit la version que vous utilisez.
> - Posez des questions précises pour obtenir des réponses détaillées.
> - Qwen Code peut expliquer des fonctionnalités complexes, telles que l’intégration de MCP, les configurations d’entreprise ou les flux de travail avancés.
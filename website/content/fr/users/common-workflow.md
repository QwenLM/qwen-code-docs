# Workflows courants

> Découvrez les workflows courants avec Qwen Code.

Chaque tâche de ce document comprend des instructions claires, des exemples de commandes et des bonnes pratiques pour vous aider à tirer le meilleur parti de Qwen Code.

## Comprendre de nouvelles bases de code

### Obtenir un aperçu rapide de la base de code

Supposons que vous veniez de rejoindre un nouveau projet et que vous deviez en comprendre rapidement la structure.

**1. Accédez au répertoire racine du projet**

```bash
cd /path/to/project
```

**2. Démarrez Qwen Code**

```bash
qwen
```

**3. Demandez un aperçu de haut niveau**

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
> - Commencez par des questions générales, puis ciblez des zones spécifiques
> - Interrogez sur les conventions de code et les modèles utilisés dans le projet
> - Demandez un glossaire des termes spécifiques au projet

### Trouver le code pertinent

Supposons que vous deviez localiser du code lié à une fonctionnalité ou une fonction spécifique.

**1. Demandez à Qwen Code de trouver les fichiers pertinents**

```
find the files that handle user authentication
```

**2. Obtenez le contexte sur l'interaction des composants**

```
how do these authentication files work together?
```

**3. Comprenez le flux d'exécution**

```
trace the login process from front-end to database
```

> [!tip]
>
> - Soyez précis sur ce que vous recherchez
> - Utilisez le vocabulaire métier du projet

## Corriger les bugs efficacement

Supposons que vous ayez rencontré un message d'erreur et que vous deviez en trouver et corriger la source.

**1. Partagez l'erreur avec Qwen Code**

```
I'm seeing an error when I run npm test
```

**2. Demandez des recommandations de correction**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. Appliquez la correction**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - Indiquez à Qwen Code la commande pour reproduire le problème et obtenir une stack trace
> - Mentionnez les étapes pour reproduire l'erreur
> - Précisez à Qwen Code si l'erreur est intermittente ou systématique

## Refactoriser du code

Supposons que vous deviez mettre à jour d'ancien code pour utiliser des modèles et pratiques modernes.

**1. Identifiez le code legacy à refactoriser**

```
find deprecated API usage in our codebase
```

**2. Obtenez des recommandations de refactoring**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. Appliquez les modifications en toute sécurité**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. Vérifiez le refactoring**

```
run tests for the refactored code
```

> [!tip]
>
> - Demandez à Qwen Code d'expliquer les avantages de l'approche moderne
> - Demandez à ce que les modifications conservent la rétrocompatibilité si nécessaire
> - Effectuez le refactoring par petites étapes testables

## Utiliser des sous-agents spécialisés

Supposons que vous souhaitiez utiliser des sous-agents IA spécialisés pour traiter des tâches spécifiques plus efficacement.

**1. Affichez les sous-agents disponibles**

```
/agents
```

Cela affiche tous les sous-agents disponibles et vous permet d'en créer de nouveaux.

**2. Utilisez les sous-agents automatiquement**

Qwen Code délègue automatiquement les tâches appropriées aux sous-agents spécialisés :

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. Demandez explicitement des sous-agents spécifiques**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. Créez des sous-agents personnalisés pour votre workflow**

```
/agents
```

Sélectionnez ensuite "create" et suivez les invites pour définir :

- Un identifiant unique décrivant l'objectif du sous-agent (par exemple, `code-reviewer`, `api-designer`).
- Quand Qwen Code doit utiliser cet agent
- Les outils auxquels il peut accéder
- Un system prompt décrivant le rôle et le comportement de l'agent

> [!tip]
>
> - Créez des sous-agents spécifiques au projet dans `.qwen/agents/` pour les partager avec l'équipe
> - Utilisez des champs `description` descriptifs pour activer la délégation automatique
> - Limitez l'accès aux outils à ce dont chaque sous-agent a réellement besoin
> - En savoir plus sur les [Sous-agents](./features/sub-agents)
> - En savoir plus sur le [Mode d'approbation](./features/approval-mode)

## Travailler avec les tests

Supposons que vous deviez ajouter des tests pour du code non couvert.

**1. Identifiez le code non testé**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. Générez le squelette de test**

```
add tests for the notification service
```

**3. Ajoutez des cas de test pertinents**

```
add test cases for edge conditions in the notification service
```

**4. Exécutez et vérifiez les tests**

```
run the new tests and fix any failures
```

Qwen Code peut générer des tests qui suivent les modèles et conventions existants de votre projet. Lorsque vous demandez des tests, soyez précis sur le comportement que vous souhaitez vérifier. Qwen Code examine vos fichiers de test existants pour correspondre au style, aux frameworks et aux modèles d'assertion déjà utilisés.

Pour une couverture complète, demandez à Qwen Code d'identifier les cas limites que vous auriez pu manquer. Qwen Code peut analyser vos chemins de code et suggérer des tests pour les conditions d'erreur, les valeurs limites et les entrées inattendues faciles à négliger.

## Créer des pull requests

Supposons que vous deviez créer une pull request bien documentée pour vos modifications.

**1. Résumez vos modifications**

```
summarize the changes I've made to the authentication module
```

**2. Générez une pull request avec Qwen Code**

```
create a pr
```

**3. Révisez et affinez**

```
enhance the PR description with more context about the security improvements
```

**4. Ajoutez des détails sur les tests**

```
add information about how these changes were tested
```

> [!tip]
>
> - Demandez directement à Qwen Code de créer une PR pour vous
> - Révisez la PR générée par Qwen Code avant de la soumettre
> - Demandez à Qwen Code de mettre en évidence les risques ou considérations potentiels

## Gérer la documentation

Supposons que vous deviez ajouter ou mettre à jour la documentation de votre code.

**1. Identifiez le code non documenté**

```
find functions without proper JSDoc comments in the auth module
```

**2. Générez la documentation**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. Révisez et améliorez**

```
improve the generated documentation with more context and examples
```

**4. Vérifiez la documentation**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - Précisez le style de documentation souhaité (JSDoc, docstrings, etc.)
> - Demandez des exemples dans la documentation
> - Demandez la documentation pour les API publiques, les interfaces et la logique complexe

## Référencer des fichiers et répertoires

Utilisez `@` pour inclure rapidement des fichiers ou répertoires sans attendre que Qwen Code les lise.

**1. Référencez un fichier unique**

```
Explain the logic in @src/utils/auth.js
```

Cela inclut le contenu complet du fichier dans la conversation.

**2. Référencez un répertoire**

```
What's the structure of @src/components?
```

Cela fournit une liste du répertoire avec les informations des fichiers.

**3. Référencez des ressources MCP**

```
Show me the data from @github: repos/owner/repo/issues
```

Cela récupère les données des serveurs MCP connectés en utilisant le format @server: resource. Consultez [MCP](./features/mcp) pour plus de détails.

> [!tip]
>
> - Les chemins de fichiers peuvent être relatifs ou absolus
> - Les références de fichiers `@` ajoutent `QWEN.md` du répertoire du fichier et des répertoires parents au contexte
> - Les références de répertoires affichent les listes de fichiers, pas leurs contenus
> - Vous pouvez référencer plusieurs fichiers dans un seul message (par exemple, "`@file 1.js` et `@file 2.js`")

## Reprendre des conversations précédentes

Supposons que vous ayez travaillé sur une tâche avec Qwen Code et que vous deviez reprendre là où vous vous êtes arrêté lors d'une session ultérieure.

Qwen Code propose deux options pour reprendre des conversations précédentes :

- `--continue` pour continuer automatiquement la conversation la plus récente
- `--resume` pour afficher un sélecteur de conversation

**1. Continuez la conversation la plus récente**

```bash
qwen --continue
```

Cela reprend immédiatement votre conversation la plus récente sans aucune invite.

**2. Continuez en mode non interactif**

```bash
qwen --continue --p "Continue with my task"
```

Utilisez `--print` avec `--continue` pour reprendre la conversation la plus récente en mode non interactif, idéal pour les scripts ou l'automatisation.

**3. Affichez le sélecteur de conversation**

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
> - Utilisez `--continue` pour un accès rapide à votre conversation la plus récente
> - Utilisez `--resume` lorsque vous devez sélectionner une conversation passée spécifique
> - Lors de la reprise, vous verrez l'intégralité de l'historique de la conversation avant de continuer
> - La conversation reprise démarre avec le même modèle et la même configuration que l'originale
>
> **Fonctionnement** :
>
> 1. **Stockage des conversations** : Toutes les conversations sont automatiquement sauvegardées localement avec leur historique complet de messages
> 2. **Désérialisation des messages** : Lors de la reprise, l'intégralité de l'historique des messages est restaurée pour conserver le contexte
> 3. **État des outils** : L'utilisation des outils et les résultats de la conversation précédente sont conservés
> 4. **Restauration du contexte** : La conversation reprend avec tout le contexte précédent intact
>
> **Exemples** :
>
> ```bash
> # Continue most recent conversation
> qwen --continue
>
> # Continue most recent conversation with a specific prompt
> qwen --continue --p "Show me our progress"
>
> # Show conversation picker
> qwen --resume
>
> # Continue most recent conversation in non-interactive mode
> qwen --continue --p "Run the tests again"
> ```

## Exécuter des sessions Qwen Code parallèles avec des Git worktrees

Supposons que vous deviez travailler sur plusieurs tâches simultanément avec une isolation complète du code entre les instances Qwen Code.

**1. Comprendre les Git worktrees**

Les Git worktrees vous permettent de checker plusieurs branches du même dépôt dans des répertoires distincts. Chaque worktree possède son propre répertoire de travail avec des fichiers isolés, tout en partageant le même historique Git. Pour en savoir plus, consultez la [documentation officielle des Git worktrees](https://git-scm.com/docs/git-worktree).

**2. Créez un nouveau worktree**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

Cela crée un nouveau répertoire avec une copie de travail séparée de votre dépôt.

**3. Exécutez Qwen Code dans chaque worktree**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. Exécutez Qwen Code dans un autre worktree**

```bash
cd ../project-bugfix
qwen
```

**5. Gérez vos worktrees**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Chaque worktree possède son propre état de fichier indépendant, ce qui le rend idéal pour les sessions Qwen Code parallèles
> - Les modifications apportées dans un worktree n'affecteront pas les autres, empêchant les instances Qwen Code d'interférer entre elles
> - Tous les worktrees partagent le même historique Git et les mêmes connexions distantes
> - Pour les tâches de longue durée, vous pouvez laisser Qwen Code travailler dans un worktree tout en poursuivant le développement dans un autre
> - Utilisez des noms de répertoire descriptifs pour identifier facilement la tâche associée à chaque worktree
> - N'oubliez pas d'initialiser votre environnement de développement dans chaque nouveau worktree selon la configuration de votre projet. Selon votre stack, cela peut inclure :
>   - Projets JavaScript : Exécution de l'installation des dépendances (`npm install`, `yarn`)
>   - Projets Python : Configuration d'environnements virtuels ou installation via des gestionnaires de paquets
>   - Autres langages : Suivi du processus de configuration standard de votre projet

## Utiliser Qwen Code comme utilitaire de type Unix

### Ajouter Qwen Code à votre processus de vérification

Supposons que vous souhaitiez utiliser Qwen Code comme linter ou relecteur de code.

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
> - Personnalisez le prompt pour vérifier des problèmes spécifiques pertinents pour votre projet
> - Envisagez de créer plusieurs scripts pour différents types de vérification

### Entrée et sortie via pipe

Supposons que vous souhaitiez envoyer des données à Qwen Code via un pipe, et récupérer des données dans un format structuré.

**Transmettez des données via un pipe à Qwen Code :**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Utilisez les pipes pour intégrer Qwen Code dans des scripts shell existants
> - Combinez-les avec d'autres outils Unix pour des workflows puissants
> - Envisagez d'utiliser `--output-format` pour une sortie structurée

### Contrôler le format de sortie

Supposons que vous ayez besoin de la sortie de Qwen Code dans un format spécifique, notamment lors de l'intégration de Qwen Code dans des scripts ou d'autres outils.

**1. Utilisez le format texte (par défaut)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Cela génère uniquement la réponse en texte brut de Qwen Code (comportement par défaut).

**2. Utilisez le format JSON**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Cela génère un tableau JSON de messages avec des métadonnées incluant le coût et la durée.

**3. Utilisez le format JSON en streaming**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Cela génère une série d'objets JSON en temps réel pendant que Qwen Code traite la requête. Chaque message est un objet JSON valide, mais la sortie complète n'est pas un JSON valide si elle est concaténée.

> [!tip]
>
> - Utilisez `--output-format text` pour les intégrations simples où vous avez juste besoin de la réponse de Qwen Code
> - Utilisez `--output-format json` lorsque vous avez besoin du journal complet de la conversation
> - Utilisez `--output-format stream-json` pour une sortie en temps réel de chaque tour de conversation

## Interroger Qwen Code sur ses capacités

Qwen Code dispose d'un accès intégré à sa documentation et peut répondre aux questions sur ses propres fonctionnalités et limites.

### Exemples de questions

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> Qwen Code fournit des réponses basées sur la documentation à ces questions. Pour des exemples exécutables et des démonstrations pratiques, reportez-vous aux sections de workflow spécifiques ci-dessus.

> [!tip]
>
> - Qwen Code a toujours accès à la dernière documentation de Qwen Code, quelle que soit la version que vous utilisez
> - Posez des questions spécifiques pour obtenir des réponses détaillées
> - Qwen Code peut expliquer des fonctionnalités complexes comme l'intégration MCP, les configurations enterprise et les workflows avancés
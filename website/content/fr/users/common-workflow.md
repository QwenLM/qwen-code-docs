# Flux de travail courants

> Découvrez les flux de travail courants avec Qwen Code.

Chaque tâche de ce document inclut des instructions claires, des exemples de commandes et des bonnes pratiques pour vous aider à tirer le meilleur parti de Qwen Code.

## Comprendre de nouvelles bases de code

### Obtenir un aperçu rapide de la base de code

Supposons que vous venez de rejoindre un nouveau projet et que vous devez comprendre rapidement sa structure.

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
donne-moi un aperçu de cette base de code
```

**4. Approfondissez des composants spécifiques**

```
explique les principaux motifs d'architecture utilisés ici
```

```
quels sont les modèles de données clés ?
```

```
comment l'authentification est-elle gérée ?
```

> [!tip]
>
> - Commencez par des questions larges, puis concentrez-vous sur des zones spécifiques
> - Interrogez sur les conventions et les motifs de codage utilisés dans le projet
> - Demandez un glossaire des termes spécifiques au projet

### Trouver du code pertinent

Supposons que vous ayez besoin de localiser le code lié à une fonctionnalité ou une fonctionnalité spécifique.

**1. Demandez à Qwen Code de trouver les fichiers pertinents**

```
trouve les fichiers qui gèrent l'authentification des utilisateurs
```

**2. Obtenez le contexte sur la façon dont les composants interagissent**

```
comment ces fichiers d'authentification fonctionnent-ils ensemble ?
```

**3. Comprenez le flux d'exécution**

```
trace le processus de connexion du front-end à la base de données
```

> [!tip]
>
> - Soyez précis sur ce que vous cherchez
> - Utilisez le langage propre au projet

## Corriger les bugs efficacement

Supposons que vous ayez rencontré un message d'erreur et que vous deviez en trouver et en corriger la source.

**1. Partagez l'erreur avec Qwen Code**

```
Je vois une erreur quand j'exécute npm test
```

**2. Demandez des recommandations de correction**

```
suggère quelques façons de corriger le @ts-ignore dans user.ts
```

**3. Appliquez la correction**

```
mets à jour user.ts pour ajouter la vérification null que tu as suggérée
```

> [!tip]
>
> - Indiquez à Qwen Code la commande pour reproduire le problème et obtenir une trace de la pile
> - Mentionnez les étapes pour reproduire l'erreur
> - Faites savoir à Qwen Code si l'erreur est intermittente ou constante

## Refactoriser le code

Supposons que vous deviez mettre à jour du code ancien pour utiliser des motifs et pratiques modernes.

**1. Identifiez le code hérité à refactoriser**

```
trouve les utilisations d'API obsolètes dans notre base de code
```

**2. Obtenez des recommandations de refactorisation**

```
suggère comment refactoriser utils.js pour utiliser les fonctionnalités modernes de JavaScript
```

**3. Appliquez les modifications en toute sécurité**

```
refactorise utils.js pour utiliser les fonctionnalités ES 2024 tout en maintenant le même comportement
```

**4. Vérifiez la refactorisation**

```
exécute les tests pour le code refactorisé
```

> [!tip]
>
> - Demandez à Qwen Code d'expliquer les avantages de l'approche moderne
> - Exigez que les modifications conservent la rétrocompatibilité si nécessaire
> - Effectuez la refactorisation par petites étapes testables

## Utiliser des sous-agents spécialisés

Supposons que vous souhaitiez utiliser des sous-agents IA spécialisés pour traiter des tâches spécifiques plus efficacement.

**1. Consultez les sous-agents disponibles**

```
/agents
```

Cela affiche tous les sous-agents disponibles et vous permet d'en créer de nouveaux.

**2. Utilisez les sous-agents automatiquement**

Qwen Code délègue automatiquement les tâches appropriées à des sous-agents spécialisés :

```
vérifie mes récentes modifications de code pour les problèmes de sécurité
```

```
exécute tous les tests et corrige les échecs
```

**3. Demandez explicitement des sous-agents spécifiques**

```
utilise le sous-agent code-reviewer pour vérifier le module d'authentification
```

```
demande au sous-agent debugger d'enquêter sur pourquoi les utilisateurs ne peuvent pas se connecter
```

**4. Créez des sous-agents personnalisés pour votre flux de travail**

```
/agents
```

Sélectionnez ensuite « créer » et suivez les instructions pour définir :

- Un identifiant unique qui décrit l'objectif du sous-agent (par exemple, `code-reviewer`, `api-designer`)
- Quand Qwen Code doit utiliser cet agent
- Quels outils il peut utiliser
- Une invite système décrivant le rôle et le comportement de l'agent

> [!tip]
>
> - Créez des sous-agents spécifiques au projet dans `.qwen/agents/` pour le partage en équipe
> - Utilisez des champs `description` descriptifs pour permettre la délégation automatique
> - Limitez l'accès aux outils à ce dont chaque sous-agent a réellement besoin
> - En savoir plus sur les [Sous-agents](./features/sub-agents)
> - En savoir plus sur le [Mode d'approbation](./features/approval-mode)

## Travailler avec les tests

Supposons que vous deviez ajouter des tests pour du code non couvert.

**1. Identifiez le code non testé**

```
trouve les fonctions dans NotificationsService.swift qui ne sont pas couvertes par les tests
```

**2. Générez un squelette de test**

```
ajoute des tests pour le service de notification
```

**3. Ajoutez des cas de test significatifs**

```
ajoute des cas de test pour les conditions limites dans le service de notification
```

**4. Exécutez et vérifiez les tests**

```
exécute les nouveaux tests et corrige les échecs
```

Qwen Code peut générer des tests qui suivent les motifs et conventions existants de votre projet. Lorsque vous demandez des tests, soyez précis sur le comportement que vous souhaitez vérifier. Qwen Code examine vos fichiers de test existants pour correspondre au style, aux frameworks et aux motifs d'assertion déjà utilisés.

Pour une couverture complète, demandez à Qwen Code d'identifier les cas limites que vous auriez pu manquer. Qwen Code peut analyser vos chemins de code et suggérer des tests pour les conditions d'erreur, les valeurs limites et les entrées inattendues qui sont faciles à négliger.
## Créer des pull requests

Supposons que vous ayez besoin de créer une pull request bien documentée pour vos modifications.

**1. Résumez vos modifications**

```
résumez les modifications que j'ai apportées au module d'authentification
```

**2. Générez une pull request avec Qwen Code**

```
créez une pr
```

**3. Examinez et affinez**

```
améliorez la description de la PR avec plus de contexte sur les améliorations de sécurité
```

**4. Ajoutez des détails de test**

```
ajoutez des informations sur la façon dont ces modifications ont été testées
```

> [!tip]
>
> - Demandez directement à Qwen Code de créer une PR à votre place
> - Examinez la PR générée par Qwen Code avant de la soumettre
> - Demandez à Qwen Code de mettre en évidence les risques ou considérations potentiels

## Gérer la documentation

Supposons que vous deviez ajouter ou mettre à jour la documentation de votre code.

**1. Identifiez le code non documenté**

```
trouvez les fonctions sans commentaires JSDoc appropriés dans le module d'authentification
```

**2. Générez la documentation**

```
ajoutez des commentaires JSDoc aux fonctions non documentées dans auth.js
```

**3. Examinez et améliorez**

```
améliorez la documentation générée avec plus de contexte et d'exemples
```

**4. Vérifiez la documentation**

```
vérifiez si la documentation respecte nos normes de projet
```

> [!tip]
>
> - Spécifiez le style de documentation souhaité (JSDoc, docstrings, etc.)
> - Demandez des exemples dans la documentation
> - Demandez la documentation pour les API publiques, les interfaces et la logique complexe

## Référencer des fichiers et répertoires

Utilisez `@` pour inclure rapidement des fichiers ou des répertoires sans attendre que Qwen Code les lise.

**1. Référencez un seul fichier**

```
Expliquez la logique dans @src/utils/auth.js
```

Cela inclut le contenu complet du fichier dans la conversation.

**2. Référencez un répertoire**

```
Quelle est la structure de @src/components ?
```

Cela fournit une liste du répertoire avec les informations sur les fichiers.

**3. Référencez des ressources MCP**

```
Affichez-moi les données de @github: repos/owner/repo/issues
```

Cela récupère les données des serveurs MCP connectés en utilisant le format @serveur: ressource. Voir [MCP](./features/mcp) pour plus de détails.

> [!tip]
>
> - Les chemins de fichiers peuvent être relatifs ou absolus
> - Les références avec @ ajoutent le fichier `QWEN.md` présent dans le répertoire du fichier et ses répertoires parents au contexte
> - Les références aux répertoires affichent la liste des fichiers, pas leur contenu
> - Vous pouvez référencer plusieurs fichiers dans un seul message (par exemple, "`@fichier1.js` et `@fichier2.js`")

## Reprendre des conversations précédentes

Supposons que vous ayez travaillé sur une tâche avec Qwen Code et que vous deviez reprendre là où vous vous êtes arrêté lors d'une session ultérieure.

Qwen Code propose deux options pour reprendre des conversations précédentes :

- `--continue` pour reprendre automatiquement la conversation la plus récente
- `--resume` pour afficher un sélecteur de conversations

**1. Reprendre la conversation la plus récente**

```bash
qwen --continue
```

Cela reprend immédiatement votre conversation la plus récente sans aucune invite.

**2. Reprendre en mode non interactif**

```bash
qwen --continue -p "Continuez ma tâche"
```

Utilisez `-p` (ou `--prompt`) avec `--continue` pour reprendre la conversation la plus récente en mode non interactif, parfait pour les scripts ou l'automatisation.

**3. Afficher le sélecteur de conversations**

```bash
qwen --resume
```

Cela affiche un sélecteur de conversations interactif avec une vue en liste claire montrant :

- Résumé de la session (ou invite initiale)
- Métadonnées : temps écoulé, nombre de messages et branche git

Utilisez les touches fléchées pour naviguer et appuyez sur Entrée pour sélectionner une conversation. Appuyez sur Échap pour quitter.

> [!tip]
>
> - L'historique des conversations est stocké localement sur votre machine
> - Utilisez `--continue` pour un accès rapide à votre conversation la plus récente
> - Utilisez `--resume` lorsque vous devez sélectionner une conversation passée spécifique
> - Lors de la reprise, vous verrez l'historique complet de la conversation avant de continuer
> - La conversation reprise démarre avec le même modèle et la même configuration que l'originale
>
> **Comment ça fonctionne** :
>
> 1. **Stockage des conversations** : Toutes les conversations sont automatiquement sauvegardées localement avec leur historique complet de messages
> 2. **Désérialisation des messages** : Lors de la reprise, l'historique complet des messages est restauré pour maintenir le contexte
> 3. **État des outils** : L'utilisation des outils et les résultats de la conversation précédente sont préservés
> 4. **Restauration du contexte** : La conversation reprend avec tout le contexte précédent intact
>
> **Exemples** :
>
> ```bash
> # Reprendre la conversation la plus récente
> qwen --continue
>
> # Reprendre la conversation la plus récente avec une invite spécifique
> qwen --continue -p "Montrez-moi notre progression"
>
> # Afficher le sélecteur de conversations
> qwen --resume
>
> # Reprendre la conversation la plus récente en mode non interactif
> qwen --continue -p "Relancez les tests"
> ```

## Exécuter des sessions Qwen Code parallèles avec les worktrees Git

Supposons que vous ayez besoin de travailler simultanément sur plusieurs tâches avec un isolement complet du code entre les instances de Qwen Code.

**1. Comprendre les worktrees Git**

Les worktrees Git vous permettent d'extraire plusieurs branches du même référentiel dans des répertoires séparés. Chaque worktree possède son propre répertoire de travail avec des fichiers isolés, tout en partageant le même historique Git. Apprenez-en plus dans la [documentation officielle de Git worktree](https://git-scm.com/docs/git-worktree).
**2. Créer un nouveau worktree**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

Ceci crée un nouveau répertoire avec une copie de travail séparée de votre dépôt.

**3. Exécuter Qwen Code dans chaque worktree**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. Exécuter Qwen Code dans un autre worktree**

```bash
cd ../project-bugfix
qwen
```

**5. Gérer vos worktrees**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Chaque worktree possède son propre état de fichier indépendant, ce qui le rend parfait pour des sessions Qwen Code parallèles
> - Les modifications apportées dans un worktree n'affectent pas les autres, empêchant ainsi les instances Qwen Code d'interférer entre elles
> - Tous les worktrees partagent le même historique Git et les mêmes connexions distantes
> - Pour les tâches longues, vous pouvez avoir Qwen Code qui travaille dans un worktree pendant que vous continuez le développement dans un autre
> - Utilisez des noms de répertoire descriptifs pour identifier facilement à quelle tâche correspond chaque worktree
> - N'oubliez pas d'initialiser votre environnement de développement dans chaque nouveau worktree selon la configuration de votre projet. Selon votre stack, cela peut inclure :
>   - Projets JavaScript : Exécution de l'installation des dépendances (`npm install`, `yarn`)
>   - Projets Python : Configuration d'environnements virtuels ou installation avec des gestionnaires de paquets
>   - Autres langages : Suivez le processus standard de configuration de votre projet

## Utiliser Qwen Code comme un utilitaire de style Unix

### Ajouter Qwen Code à votre processus de vérification

Supposons que vous souhaitiez utiliser Qwen Code comme linter ou réviseur de code.

**Ajouter Qwen Code à votre script de build :**

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
> - Utilisez Qwen Code pour une revue de code automatisée dans votre pipeline CI/CD
> - Personnalisez le prompt pour vérifier des problèmes spécifiques à votre projet
> - Envisagez de créer plusieurs scripts pour différents types de vérification

### Entrée et sortie par tube (pipe)

Supposons que vous souhaitiez envoyer des données par tube à Qwen Code et recevoir des données dans un format structuré.

**Envoyer des données via un tube à Qwen Code :**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Utilisez les tubes pour intégrer Qwen Code dans des scripts shell existants
> - Combinez avec d'autres outils Unix pour des workflows puissants
> - Envisagez d'utiliser --output-format pour une sortie structurée

### Contrôler le format de sortie

Supposons que vous ayez besoin de la sortie de Qwen Code dans un format spécifique, surtout lors de l'intégration de Qwen Code dans des scripts ou d'autres outils.

**1. Utiliser le format texte (par défaut)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Ceci produit uniquement la réponse textuelle brute de Qwen Code (comportement par défaut).

**2. Utiliser le format JSON**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Ceci produit un tableau JSON de messages avec des métadonnées incluant le coût et la durée.

**3. Utiliser le format JSON en streaming**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Ceci produit une série d'objets JSON en temps réel pendant que Qwen Code traite la requête. Chaque message est un objet JSON valide, mais la sortie entière n'est pas un JSON valide si concaténée.

> [!tip]
>
> - Utilisez `--output-format text` pour des intégrations simples où vous avez juste besoin de la réponse de Qwen Code
> - Utilisez `--output-format json` lorsque vous avez besoin du journal complet de la conversation
> - Utilisez `--output-format stream-json` pour une sortie en temps réel de chaque tour de conversation

## Demander à Qwen Code à propos de ses capacités

Qwen Code dispose d'un accès intégré à sa documentation et peut répondre aux questions sur ses propres fonctionnalités et limitations.

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
> Qwen Code fournit des réponses basées sur la documentation à ces questions. Pour des exemples exécutables et des démonstrations pratiques, référez-vous aux sections de workflows spécifiques ci-dessus.

> [!tip]
>
> - Qwen Code a toujours accès à la documentation la plus récente de Qwen Code, quelle que soit la version que vous utilisez
> - Posez des questions spécifiques pour obtenir des réponses détaillées
> - Qwen Code peut expliquer des fonctionnalités complexes comme l'intégration MCP, les configurations d'entreprise et les workflows avancés

# Workflows courants

> Découvrez les workflows courants avec Qwen Code.

Chaque tâche de ce document inclut des instructions claires, des exemples de commandes et des bonnes pratiques pour vous aider à tirer le meilleur parti de Qwen Code.

## Comprendre de nouvelles bases de code

### Obtenir un aperçu rapide d'une base de code

Supposons que vous venez de rejoindre un nouveau projet et que vous devez comprendre rapidement sa structure.

**1. Accédez au répertoire racine du projet**

```bash
cd /path/to/project
```

**2. Lancez Qwen Code**

```bash
qwen
```

**3. Demandez un aperçu de haut niveau**

```
donne-moi un aperçu de cette base de code
```

**4. Approfondissez des composants spécifiques**

```
explique les principaux motifs architecturaux utilisés ici
```

```
quels sont les modèles de données clés ?
```

```
comment l'authentification est-elle gérée ?
```

> [!tip]
>
> - Commencez par des questions générales, puis affinez sur des zones spécifiques
> - Interrogez sur les conventions de codage et les modèles utilisés dans le projet
> - Demandez un glossaire des termes propres au projet

### Trouver le code pertinent

Supposons que vous ayez besoin de localiser le code lié à une fonctionnalité spécifique.

**1. Demandez à Qwen Code de trouver les fichiers pertinents**

```
trouve les fichiers qui gèrent l'authentification utilisateur
```

**2. Obtenez du contexte sur l'interaction des composants**

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
> - Utilisez le langage métier du projet

## Corriger les bugs efficacement

Supposons que vous ayez rencontré un message d'erreur et que vous deviez trouver et corriger sa source.

**1. Partagez l'erreur avec Qwen Code**

```
Je vois une erreur quand j'exécute npm test
```

**2. Demandez des recommandations de correctifs**

```
suggère quelques façons de corriger le @ts-ignore dans user.ts
```

**3. Appliquez le correctif**

```
mets à jour user.ts pour ajouter la vérification null que tu as suggérée
```

> [!tip]
>
> - Indiquez à Qwen Code la commande pour reproduire le problème et obtenir une stack trace
> - Mentionnez les étapes pour reproduire l'erreur
> - Dites à Qwen Code si l'erreur est intermittente ou constante

## Refactoriser du code

Supposons que vous deviez mettre à jour du code ancien pour utiliser des pratiques et des motifs modernes.

**1. Identifiez le code legacy à refactoriser**

```
trouve les usages d'API dépréciées dans notre base de code
```

**2. Obtenez des recommandations de refactorisation**

```
suggère comment refactoriser utils.js pour utiliser les fonctionnalités modernes de JavaScript
```

**3. Appliquez les changements en toute sécurité**

```
refactorise utils.js pour utiliser les fonctionnalités ES 2024 tout en gardant le même comportement
```

**4. Vérifiez la refactorisation**

```
exécute les tests pour le code refactorisé
```

> [!tip]
>
> - Demandez à Qwen Code d'expliquer les avantages de l'approche moderne
> - Exigez que les changements maintiennent la rétrocompatibilité si nécessaire
> - Effectuez la refactorisation par petits incréments testables

## Utiliser des sous-agents spécialisés

Supposons que vous souhaitiez utiliser des sous-agents IA spécialisés pour gérer des tâches spécifiques plus efficacement.

**1. Affichez les sous-agents disponibles**

```
/agents
```

Cela montre tous les sous-agents disponibles et vous permet d'en créer de nouveaux.

**2. Utilisez automatiquement les sous-agents**

Qwen Code délègue automatiquement les tâches appropriées aux sous-agents spécialisés :

```
vérifie mes récentes modifications de code pour des problèmes de sécurité
```

```
exécute tous les tests et corrige les échecs
```

**3. Demandez explicitement des sous-agents spécifiques**

```
utilise le sous-agent code-reviewer pour vérifier le module d'authentification
```

```
demande au sous-agent debugger d'enquêter sur l'impossibilité pour les utilisateurs de se connecter
```

**4. Créez des sous-agents personnalisés pour votre workflow**

```
/agents
```

Sélectionnez ensuite « créer » et suivez les instructions pour définir :

- Un identifiant unique décrivant l'objectif du sous-agent (par exemple `code-reviewer`, `api-designer`).
- Quand Qwen Code doit utiliser cet agent
- Quels outils il peut accéder
- Un prompt système décrivant le rôle et le comportement de l'agent

> [!tip]
>
> - Créez des sous-agents spécifiques au projet dans `.qwen/agents/` pour le partage en équipe
> - Utilisez des champs `description` explicites pour permettre la délégation automatique
> - Limitez l'accès aux outils à ce dont chaque sous-agent a réellement besoin
> - En savoir plus sur les [Sous-agents](./features/sub-agents)
> - En savoir plus sur le [Mode d'approbation](./features/approval-mode)

## Travailler avec les tests

Supposons que vous deviez ajouter des tests pour du code non couvert.

**1. Identifiez le code non testé**

```
trouve les fonctions dans NotificationsService.swift qui ne sont pas couvertes par les tests
```

**2. Générez une structure de test**

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

Qwen Code peut générer des tests qui suivent les motifs et conventions existants de votre projet. Lorsque vous demandez des tests, soyez précis sur le comportement à vérifier. Qwen Code examine vos fichiers de test existants pour correspondre au style, aux frameworks et aux motifs d'assertion déjà en usage.

Pour une couverture complète, demandez à Qwen Code d'identifier les cas limites que vous pourriez avoir oubliés. Qwen Code peut analyser vos chemins de code et suggérer des tests pour les conditions d'erreur, les valeurs limites et les entrées inattendues qui sont faciles à négliger.

## Créer des pull requests

Supposons que vous deviez créer une pull request bien documentée pour vos modifications.

**1. Résumez vos modifications**

```
résume les modifications que j'ai apportées au module d'authentification
```

**2. Générez une pull request avec Qwen Code**

```
crée une pr
```

**3. Révisez et affinez**

```
améliore la description de la PR avec plus de contexte sur les améliorations de sécurité
```

**4. Ajoutez des détails sur les tests**

```
ajoute des informations sur la façon dont ces modifications ont été testées
```

> [!tip]
>
> - Demandez directement à Qwen Code de créer une PR pour vous
> - Révisez la PR générée par Qwen Code avant de la soumettre
> - Demandez à Qwen Code de signaler les risques ou considérations potentiels

## Gérer la documentation

Supposons que vous deviez ajouter ou mettre à jour la documentation de votre code.

**1. Identifiez le code non documenté**

```
trouve les fonctions sans commentaires JSDoc appropriés dans le module d'authentification
```

**2. Générez de la documentation**

```
ajoute des commentaires JSDoc aux fonctions non documentées dans auth.js
```

**3. Révisez et améliorez**

```
améliore la documentation générée avec plus de contexte et d'exemples
```

**4. Vérifiez la documentation**

```
vérifie si la documentation suit nos standards de projet
```

> [!tip]
>
> - Spécifiez le style de documentation souhaité (JSDoc, docstrings, etc.)
> - Demandez des exemples dans la documentation
> - Demandez une documentation pour les API publiques, les interfaces et la logique complexe

## Référencer fichiers et répertoires

Utilisez `@` pour inclure rapidement des fichiers ou des répertoires sans attendre que Qwen Code les lise.

**1. Référencez un seul fichier**

```
Explique la logique dans @src/utils/auth.js
```

Cela inclut le contenu complet du fichier dans la conversation.

**2. Référencez un répertoire**

```
Quelle est la structure de @src/components ?
```

Cela fournit un listing du répertoire avec des informations sur les fichiers.

**3. Référencez des ressources MCP**

```
Montre-moi les données de @github: repos/owner/repo/issues
```

Cela récupère les données des serveurs MCP connectés en utilisant le format @serveur: ressource. Voir [MCP](./features/mcp) pour les détails.

> [!tip]
>
> - Les chemins de fichiers peuvent être relatifs ou absolus
> - Les références de type @fichier ajoutent `QWEN.md` dans le répertoire du fichier et ses répertoires parents au contexte
> - Les références de répertoire montrent les listes de fichiers, pas leur contenu
> - Vous pouvez référencer plusieurs fichiers dans un seul message (par exemple, « `@fichier1.js` et `@fichier2.js` »)

## Reprendre des conversations précédentes

Supposons que vous ayez travaillé sur une tâche avec Qwen Code et que vous deviez reprendre là où vous vous êtes arrêté dans une session ultérieure.

Qwen Code propose deux options pour reprendre des conversations précédentes :

- `--continue` pour reprendre automatiquement la conversation la plus récente
- `--resume` pour afficher un sélecteur de conversation

**1. Reprendre la conversation la plus récente**

```bash
qwen --continue
```

Cela reprend immédiatement votre conversation la plus récente sans aucune invite.

**2. Reprendre en mode non interactif**

```bash
qwen --continue -p "Continue with my task"
```

Utilisez `-p` (ou `--prompt`) avec `--continue` pour reprendre la conversation la plus récente en mode non interactif, parfait pour les scripts ou l'automatisation.

**3. Afficher le sélecteur de conversation**

```bash
qwen --resume
```

Cela affiche un sélecteur de conversation interactif avec une vue en liste propre montrant :

- Le résumé de la session (ou le prompt initial)
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
> # Reprendre la conversation la plus récente avec un prompt spécifique
> qwen --continue -p "Montre-moi notre progression"
>
> # Afficher le sélecteur de conversation
> qwen --resume
>
> # Reprendre la conversation la plus récente en mode non interactif
> qwen --continue -p "Relance les tests"
> ```

## Exécuter des sessions Qwen Code parallèles avec les Git worktrees

Supposons que vous deviez travailler sur plusieurs tâches simultanément avec une isolation complète du code entre les instances de Qwen Code.

**1. Comprendre les Git worktrees**

Les Git worktrees vous permettent de vérifier plusieurs branches du même dépôt dans des répertoires séparés. Chaque worktree possède son propre répertoire de travail avec des fichiers isolés, tout en partageant le même historique Git. En savoir plus dans la [documentation officielle de Git worktree](https://git-scm.com/docs/git-worktree).

**2. Créer un nouveau worktree**

```bash
# Créer un nouveau worktree avec une nouvelle branche
git worktree add ../project-feature-a -b feature-a

# Ou créer un worktree avec une branche existante
git worktree add ../project-bugfix bugfix-123
```

Cela crée un nouveau répertoire avec une copie de travail séparée de votre dépôt.

**3. Exécuter Qwen Code dans chaque worktree**

```bash
# Accédez à votre worktree
cd ../project-feature-a

# Exécutez Qwen Code dans cet environnement isolé
qwen
```

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
> - Chaque worktree a son propre état de fichier indépendant, ce qui le rend parfait pour des sessions Qwen Code parallèles
> - Les modifications apportées dans un worktree n'affectent pas les autres, empêchant les instances Qwen Code de s' interférer
> - Tous les worktrees partagent le même historique Git et les mêmes connexions distantes
> - Pour les tâches longues, vous pouvez avoir Qwen Code qui travaille dans un worktree pendant que vous continuez le développement dans un autre
> - Utilisez des noms de répertoires descriptifs pour identifier facilement à quelle tâche chaque worktree est destiné
> - N'oubliez pas d'initialiser votre environnement de développement dans chaque nouveau worktree selon la configuration de votre projet. Selon votre stack, cela peut inclure :
>   - Projets JavaScript : Exécution de l'installation des dépendances (`npm install`, `yarn`)
>   - Projets Python : Configuration d'environnements virtuels ou installation avec des gestionnaires de paquets
>   - Autres langages : Suivi du processus de configuration standard de votre projet

## Utiliser Qwen Code comme un utilitaire de type Unix

### Ajouter Qwen Code à votre processus de vérification

Supposons que vous souhaitiez utiliser Qwen Code comme un linter ou un réviseur de code.

**Ajoutez Qwen Code à votre script de build :**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'tu es un linter. regarde les modifications par rapport à main et signale tout problème lié à des fautes de frappe. signale le nom du fichier et le numéro de ligne sur une ligne, et une description du problème sur la deuxième ligne. ne renvoie aucun autre texte.'"
    }
}
```

> [!tip]
>
> - Utilisez Qwen Code pour une revue de code automatisée dans votre pipeline CI/CD
> - Personnalisez le prompt pour vérifier des problèmes spécifiques à votre projet
> - Envisagez de créer plusieurs scripts pour différents types de vérification

### Pipe in, pipe out

Supposons que vous souhaitiez envoyer des données à Qwen Code via un pipe et récupérer des données dans un format structuré.

**Envoyez des données via un pipe à Qwen Code :**

```bash
cat build-error.txt | qwen -p 'explique de manière concise la cause première de cette erreur de build' > output.txt
```

> [!tip]
>
> - Utilisez les pipes pour intégrer Qwen Code dans des scripts shell existants
> - Combinez avec d'autres outils Unix pour des workflows puissants
> - Envisagez d'utiliser --output-format pour une sortie structurée

### Contrôler le format de sortie

Supposons que vous ayez besoin de la sortie de Qwen Code dans un format spécifique, surtout lors de l'intégration de Qwen Code dans des scripts ou d'autres outils.

**1. Utilisez le format texte (par défaut)**

```bash
cat data.txt | qwen -p 'résume ces données' --output-format text > summary.txt
```

Cela produit uniquement la réponse texte brute de Qwen Code (comportement par défaut).

**2. Utilisez le format JSON**

```bash
cat code.py | qwen -p 'analyse ce code pour détecter des bugs' --output-format json > analysis.json
```

Cela produit un tableau JSON de messages avec des métadonnées incluant le coût et la durée.

**3. Utilisez le format JSON en streaming**

```bash
cat log.txt | qwen -p 'analyse ce fichier journal pour les erreurs' --output-format stream-json
```

Cela produit une série d'objets JSON en temps réel pendant que Qwen Code traite la requête. Chaque message est un objet JSON valide, mais l'ensemble de la sortie n'est pas un JSON valide si concaténé.

> [!tip]
>
> - Utilisez `--output-format text` pour des intégrations simples où vous avez juste besoin de la réponse de Qwen Code
> - Utilisez `--output-format json` lorsque vous avez besoin du journal complet de la conversation
> - Utilisez `--output-format stream-json` pour une sortie en temps réel de chaque tour de conversation

## Interroger Qwen Code sur ses capacités

Qwen Code a un accès intégré à sa documentation et peut répondre à des questions sur ses propres fonctionnalités et limitations.

### Exemples de questions

```
est-ce que Qwen Code peut créer des pull requests ?
```

```
comment Qwen Code gère-t-il les permissions ?
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
quelles sont les limitations de Qwen Code ?
```

> [!note]
>
> Qwen Code fournit des réponses basées sur la documentation à ces questions. Pour des exemples exécutables et des démonstrations pratiques, référez-vous aux sections de workflow spécifiques ci-dessus.

> [!tip]
>
> - Qwen Code a toujours accès à la documentation la plus récente de Qwen Code, indépendamment de la version que vous utilisez
> - Posez des questions spécifiques pour obtenir des réponses détaillées
> - Qwen Code peut expliquer des fonctionnalités complexes comme l'intégration MCP, les configurations d'entreprise et les workflows avancés
# Processus d’automatisation et de tri

Ce document fournit un aperçu détaillé des processus automatisés que nous utilisons pour gérer et trier les problèmes (*issues*) et les demandes d’intégration (*pull requests*). Notre objectif est de fournir un retour rapide et de garantir que les contributions sont examinées et intégrées de manière efficace. Comprendre cette automatisation vous aidera, en tant que contributeur, à savoir à quoi vous attendre et à interagir au mieux avec les robots de notre référentiel.

## Principe directeur : problèmes (*issues*) et demandes d’intégration (*pull requests*)

Avant tout, presque chaque demande d’intégration (*Pull Request*, ou PR) doit être liée à un problème (*issue*) correspondant. Le problème décrit le « quoi » et le « pourquoi » (le bogue ou la fonctionnalité), tandis que la PR décrit le « comment » (l’implémentation). Cette séparation nous aide à suivre l’avancement du travail, à prioriser les fonctionnalités et à conserver un contexte historique clair. Notre automatisation repose sur ce principe.

---

## Flux de travail d’automatisation détaillés

Voici une description des flux de travail d’automatisation spécifiques qui s’exécutent dans notre référentiel.

### 1. Lorsque vous ouvrez un ticket : « Tri automatisé des tickets »

Il s’agit du premier bot avec lequel vous interagissez lors de la création d’un ticket. Son rôle consiste à effectuer une analyse initiale et à appliquer les étiquettes appropriées.

- **Fichier de workflow** : `.github/workflows/qwen-automated-issue-triage.yml`
- **Moment de déclenchement** : Immédiatement après la création ou la réouverture d’un ticket.
- **Fonctionnement** :
  - Il utilise un modèle Qwen pour analyser le titre et le corps du ticket selon un ensemble détaillé de directives.
  - **Applique une étiquette `area/*`** : Catégorise le ticket selon une zone fonctionnelle du projet (par exemple, `area/ux`, `area/models`, `area/platform`).
  - **Applique une étiquette `kind/*`** : Identifie le type de ticket (par exemple, `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applique une étiquette `priority/*`** : Attribue une priorité allant de P0 (critique) à P3 (faible), en fonction de l’impact décrit.
  - **Peut appliquer l’étiquette `status/need-information`** : Si le ticket ne contient pas de détails essentiels (tels que des journaux ou des étapes de reproduction), il est signalé afin d’obtenir plus d’informations.
  - **Peut appliquer l’étiquette `status/need-retesting`** : Si le ticket fait référence à une version de l’interface en ligne de commande (CLI) datant de plus de six versions, il est signalé pour être testé à nouveau sur une version récente.
- **Ce que vous devez faire** :
  - Remplissez le modèle de ticket aussi complètement que possible. Plus vous fournissez de détails, plus le tri sera précis.
  - Si l’étiquette `status/need-information` est ajoutée, veuillez fournir les informations demandées dans un commentaire.

### 2. Lorsque vous ouvrez une demande de tirage (Pull Request) : « Intégration continue (CI) »

Ce workflow garantit que toutes les modifications respectent nos normes de qualité avant d’être fusionnées.

- **Fichier du workflow** : `.github/workflows/ci.yml`
- **Déclenchement** : À chaque envoi (*push*) vers une demande de tirage.
- **Fonctionnement** :
  - **Analyse statique (*Lint*)** : Vérifie que votre code respecte les règles de formatage et de style définies pour le projet.
  - **Tests** : Exécute l’ensemble complet des tests automatisés sur macOS, Windows et Linux, ainsi que sur plusieurs versions de Node.js. Il s’agit de la phase la plus longue du processus CI.
  - **Commentaire post-test de couverture** : Une fois tous les tests réussis, un robot publie un commentaire sur votre demande de tirage. Ce commentaire résume la couverture de vos modifications par les tests.
- **Ce que vous devez faire** :
  - Vous assurer que tous les contrôles CI réussissent. Un symbole vert ✅ apparaîtra à côté de votre validation lorsque tout est correct.
  - Si un contrôle échoue (symbole rouge ❌), cliquez sur le lien « Détails » situé à côté du contrôle échoué pour consulter les journaux (*logs*), identifier le problème, puis envoyez une correction.

### 3. Triagement continu des demandes d’incorporation (pull requests) : « Audit des PR et synchronisation des étiquettes »

Ce flux de travail s’exécute périodiquement afin de garantir que toutes les demandes d’incorporation ouvertes sont correctement liées à des problèmes (issues) et disposent d’étiquettes cohérentes.

- **Fichier du flux de travail** : `.github/workflows/qwen-scheduled-pr-triage.yml`  
- **Fréquence d’exécution** : Toutes les 15 minutes, sur l’ensemble des demandes d’incorporation ouvertes.  
- **Fonctionnalités** :  
  - **Vérification d’un problème lié** : Le robot analyse la description de votre demande d’incorporation à la recherche d’un mot-clé établissant un lien avec un problème (par exemple `Fixes #123`, `Closes #456`).  
  - **Ajout de l’étiquette `status/need-issue`** : Si aucun problème lié n’est détecté, le robot ajoute l’étiquette `status/need-issue` à votre demande d’incorporation. Cela signale clairement qu’un problème doit être créé et lié.  
  - **Synchronisation des étiquettes** : Si un problème est effectivement lié, le robot veille à ce que les étiquettes de la demande d’incorporation correspondent exactement à celles du problème. Il ajoutera les étiquettes manquantes, supprimera celles qui ne sont pas pertinentes, et retirera l’étiquette `status/need-issue` si elle était présente.  
- **Ce que vous devez faire** :  
  - **Lie toujours ta demande d’incorporation à un problème.** C’est la démarche la plus importante. Ajoute une ligne telle que `Resolves #<numéro-du-problème>` dans la description de ta demande d’incorporation.  
  - Cela garantira que ta demande d’incorporation est correctement catégorisée et progressera sans accroc dans le processus d’analyse.

### 4. Triagement continu des problèmes : « Triage planifié des problèmes »

Il s’agit d’un flux de travail de secours destiné à garantir qu’aucun problème ne soit omis par le processus de triage.

- **Fichier du flux de travail** : `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Moment de l’exécution** : Toutes les heures, sur tous les problèmes ouverts.
- **Fonctionnement** :
  - Il recherche activement les problèmes qui ne portent aucune étiquette ou qui conservent encore l’étiquette `status/need-triage`.
  - Il déclenche ensuite la même analyse puissante basée sur QwenCode que celle utilisée par le robot initial de triage afin d’appliquer les étiquettes appropriées.
- **Ce que vous devez faire** :
  - Vous n’avez généralement rien à faire. Ce flux de travail constitue une mesure de sécurité pour garantir que chaque problème soit finalement catégorisé, même si le triage initial échoue.

### 5. Automatisation des versions

Ce workflow gère le processus d’empaquetage et de publication des nouvelles versions de Qwen Code.

- **Fichier du workflow** : `.github/workflows/release.yml`
- **Déclenchement** : Selon un planning quotidien pour les versions « nightly », et manuellement pour les versions officielles (correctifs ou versions mineures).
- **Fonctionnalités** :
  - Génère automatiquement le projet, incrémente les numéros de version et publie les packages sur npm.
  - Crée une version correspondante sur GitHub avec des notes de version générées automatiquement.
- **Ce que vous devez faire** :
  - En tant que contributeur, vous n’avez aucune action à entreprendre pour ce processus. Vous pouvez être assuré qu’une fois votre demande d’intégration (PR) fusionnée dans la branche `main`, vos modifications seront incluses dans la prochaine version « nightly ».

Nous espérons que cette présentation détaillée vous sera utile. Si vous avez des questions concernant notre automatisation ou nos processus, n’hésitez pas à les poser !
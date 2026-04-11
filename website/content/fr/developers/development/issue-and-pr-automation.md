# Processus d'automatisation et de tri

Ce document présente une vue détaillée des processus automatisés que nous utilisons pour gérer et trier les issues et les pull requests. Notre objectif est de fournir des retours rapides et de garantir que les contributions sont examinées et intégrées efficacement. Comprendre cette automatisation vous aidera, en tant que contributeur, à savoir à quoi vous attendre et à interagir au mieux avec les bots de notre dépôt.

## Principe directeur : Issues et Pull Requests

Tout d'abord, presque chaque Pull Request (PR) doit être liée à une Issue correspondante. L'issue décrit le "quoi" et le "pourquoi" (le bug ou la fonctionnalité), tandis que la PR est le "comment" (l'implémentation). Cette séparation nous aide à suivre le travail, prioriser les fonctionnalités et conserver un contexte historique clair. Notre automatisation est construite autour de ce principe.

---

## Workflows d'automatisation détaillés

Voici le détail des workflows d'automatisation spécifiques qui s'exécutent dans notre dépôt.

### 1. Lorsque vous ouvrez une Issue : `Automated Issue Triage`

C'est le premier bot avec lequel vous interagirez lors de la création d'une issue. Sa mission est d'effectuer une analyse initiale et d'appliquer les labels appropriés.

- **Fichier de workflow** : `.github/workflows/qwen-automated-issue-triage.yml`
- **Quand il s'exécute** : Immédiatement après la création ou la réouverture d'une issue.
- **Ce qu'il fait** :
  - Il utilise un modèle Qwen pour analyser le titre et le corps de l'issue selon un ensemble détaillé de directives.
  - **Applique un label `area/*`** : Catégorise l'issue dans une zone fonctionnelle du projet (ex. `area/ux`, `area/models`, `area/platform`).
  - **Applique un label `kind/*`** : Identifie le type d'issue (ex. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applique un label `priority/*`** : Attribue une priorité de P0 (critique) à P3 (faible) en fonction de l'impact décrit.
  - **Peut appliquer `status/need-information`** : Si l'issue manque de détails critiques (comme des logs ou des étapes de reproduction), elle sera signalée pour demande d'informations complémentaires.
  - **Peut appliquer `status/need-retesting`** : Si l'issue fait référence à une version de la CLI datant de plus de six versions, elle sera signalée pour un retest sur une version actuelle.
- **Ce que vous devez faire** :
  - Remplissez le template d'issue aussi complètement que possible. Plus vous fournissez de détails, plus le tri sera précis.
  - Si le label `status/need-information` est ajouté, veuillez fournir les détails demandés dans un commentaire.

### 2. Lorsque vous ouvrez une Pull Request : `Continuous Integration (CI)`

Ce workflow garantit que toutes les modifications respectent nos standards de qualité avant d'être fusionnées.

- **Fichier de workflow** : `.github/workflows/ci.yml`
- **Quand il s'exécute** : À chaque push sur une pull request.
- **Ce qu'il fait** :
  - **Lint** : Vérifie que votre code respecte les règles de formatage et de style du projet.
  - **Test** : Exécute notre suite complète de tests automatisés sur macOS, Windows et Linux, ainsi que sur plusieurs versions de Node.js. C'est la partie la plus longue du processus CI.
  - **Post Coverage Comment** : Une fois tous les tests passés avec succès, un bot publiera un commentaire sur votre PR. Ce commentaire résume la couverture de vos modifications par les tests.
- **Ce que vous devez faire** :
  - Assurez-vous que toutes les vérifications CI passent. Une coche verte ✅ apparaîtra à côté de votre commit lorsque tout est réussi.
  - Si une vérification échoue (une croix rouge ❌), cliquez sur le lien "Details" à côté de la vérification échouée pour consulter les logs, identifier le problème et pousser un correctif.

### 3. Tri continu des Pull Requests : `PR Auditing and Label Sync`

Ce workflow s'exécute périodiquement pour garantir que toutes les PR ouvertes sont correctement liées à des issues et disposent de labels cohérents.

- **Fichier de workflow** : `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quand il s'exécute** : Toutes les 15 minutes sur toutes les pull requests ouvertes.
- **Ce qu'il fait** :
  - **Vérifie la présence d'une issue liée** : Le bot analyse la description de votre PR à la recherche d'un mot-clé la liant à une issue (ex. `Fixes #123`, `Closes #456`).
  - **Ajoute `status/need-issue`** : Si aucune issue liée n'est trouvée, le bot ajoutera le label `status/need-issue` à votre PR. C'est un signal clair indiquant qu'une issue doit être créée et liée.
  - **Synchronise les labels** : Si une issue _est_ liée, le bot s'assure que les labels de la PR correspondent parfaitement à ceux de l'issue. Il ajoutera les labels manquants, supprimera ceux qui ne correspondent pas, et retirera le label `status/need-issue` s'il était présent.
- **Ce que vous devez faire** :
  - **Lie toujours votre PR à une issue.** C'est l'étape la plus importante. Ajoutez une ligne comme `Resolves #<numéro-issue>` à la description de votre PR.
  - Cela garantira que votre PR est correctement catégorisée et avance sans accroc dans le processus de review.

### 4. Tri continu des Issues : `Scheduled Issue Triage`

Il s'agit d'un workflow de secours pour garantir qu'aucune issue ne soit oubliée par le processus de tri.

- **Fichier de workflow** : `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quand il s'exécute** : Toutes les heures sur toutes les issues ouvertes.
- **Ce qu'il fait** :
  - Il recherche activement les issues qui n'ont aucun label ou qui possèdent encore le label `status/need-triage`.
  - Il déclenche ensuite la même analyse puissante basée sur QwenCode que le bot de tri initial pour appliquer les labels appropriés.
- **Ce que vous devez faire** :
  - Vous n'avez généralement rien à faire. Ce workflow sert de filet de sécurité pour garantir que chaque issue finit par être catégorisée, même si le tri initial échoue.

### 5. Automatisation des releases

Ce workflow gère le processus de packaging et de publication des nouvelles versions de Qwen Code.

- **Fichier de workflow** : `.github/workflows/release.yml`
- **Quand il s'exécute** : Selon une planification quotidienne pour les releases "nightly", et manuellement pour les releases officielles patch/minor.
- **Ce qu'il fait** :
  - Build automatiquement le projet, incrémente les numéros de version et publie les packages sur npm.
  - Crée une release correspondante sur GitHub avec des notes de version générées automatiquement.
- **Ce que vous devez faire** :
  - En tant que contributeur, vous n'avez rien à faire pour ce processus. Vous pouvez être assuré qu'une fois votre PR fusionnée dans la branche `main`, vos modifications seront incluses dans la prochaine release nightly.

Nous espérons que cette vue détaillée vous sera utile. Si vous avez des questions concernant notre automatisation ou nos processus, n'hésitez pas à les poser !
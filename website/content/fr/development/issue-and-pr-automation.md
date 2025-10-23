# Processus d'automatisation et de triage

Ce document fournit un aperçu détaillé des processus automatisés que nous utilisons pour gérer et trier les issues et les pull requests. Notre objectif est de fournir un feedback rapide et de garantir que les contributions soient examinées et intégrées efficacement. Comprendre cette automatisation vous aidera en tant que contributeur à savoir quoi attendre et comment interagir au mieux avec nos bots de repository.

## Principe directeur : Issues et Pull Requests

Tout d'abord, presque chaque Pull Request (PR) doit être liée à une Issue correspondante. L'issue décrit le "quoi" et le "pourquoi" (le bug ou la fonctionnalité), tandis que la PR représente le "comment" (l'implémentation). Cette séparation nous aide à suivre le travail, à prioriser les fonctionnalités et à maintenir un contexte historique clair. Notre automatisation est construite autour de ce principe.

---

## Workflows d'automatisation détaillés

Voici une répartition des workflows d'automatisation spécifiques qui s'exécutent dans notre repository.

### 1. Lorsque vous ouvrez une Issue : `Automated Issue Triage`

C’est le premier bot avec lequel vous interagissez lorsque vous créez une issue. Son rôle est d’effectuer une analyse initiale et d’appliquer les labels appropriés.

- **Fichier de workflow** : `.github/workflows/qwen-automated-issue-triage.yml`
- **Quand il s’exécute** : Immédiatement après la création ou la réouverture d’une issue.
- **Ce qu’il fait** :
  - Il utilise un modèle Qwen pour analyser le titre et le corps de l’issue en se basant sur un ensemble détaillé de règles.
  - **Applique un seul label `area/*`** : Classe l’issue dans une zone fonctionnelle du projet (ex : `area/ux`, `area/models`, `area/platform`).
  - **Applique un seul label `kind/*`** : Identifie le type d’issue (ex : `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applique un seul label `priority/*`** : Attribue une priorité allant de P0 (critique) à P3 (faible), selon l'impact décrit.
  - **Peut appliquer `status/need-information`** : Si l’issue manque d’informations critiques (comme des logs ou des étapes de reproduction), elle sera marquée comme nécessitant plus d’informations.
  - **Peut appliquer `status/need-retesting`** : Si l’issue fait référence à une version du CLI datant de plus de six versions, elle sera marquée pour être testée à nouveau avec une version actuelle.
- **Ce que vous devez faire** :
  - Remplissez le template d’issue aussi complètement que possible. Plus vous fournissez de détails, meilleure sera la catégorisation automatique.
  - Si le label `status/need-information` est ajouté, veuillez fournir les informations demandées dans un commentaire.

### 2. Lorsque vous ouvrez une Pull Request : `Continuous Integration (CI)`

Ce workflow garantit que toutes les modifications respectent nos standards de qualité avant de pouvoir être mergées.

- **Fichier du workflow** : `.github/workflows/ci.yml`
- **Quand il s'exécute** : À chaque push sur une pull request.
- **Ce qu'il fait** :
  - **Lint** : Vérifie que votre code respecte les règles de formatage et de style du projet.
  - **Test** : Exécute la suite complète des tests automatisés sur macOS, Windows et Linux, et sur plusieurs versions de Node.js. C'est la partie la plus longue du processus CI.
  - **Post Coverage Comment** : Une fois tous les tests passés avec succès, un bot poste un commentaire sur votre PR. Ce commentaire résume le niveau de couverture de vos modifications par les tests.
- **Ce que vous devez faire** :
  - Vous assurer que tous les checks CI passent. Un checkmark vert ✅ apparaîtra à côté de votre commit lorsque tout est réussi.
  - Si un check échoue (un "X" rouge ❌), cliquez sur le lien "Details" à côté du check en échec pour consulter les logs, identifier le problème et pousser un correctif.

### 3. Tri des Pull Requests en cours : `PR Auditing and Label Sync`

Ce workflow s'exécute périodiquement pour s'assurer que toutes les PR ouvertes sont correctement liées à des issues et possèdent des labels cohérents.

- **Fichier du workflow** : `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Fréquence d'exécution** : Toutes les 15 minutes sur toutes les pull requests ouvertes.
- **Ce qu'il fait** :
  - **Vérifie la présence d'une issue liée** : Le bot analyse la description de votre PR à la recherche d'un mot-clé qui la relie à une issue (par exemple, `Fixes #123`, `Closes #456`).
  - **Ajoute le label `status/need-issue`** : Si aucune issue liée n'est trouvée, le bot ajoutera le label `status/need-issue` à votre PR. Cela signale clairement qu'une issue doit être créée et associée.
  - **Synchronise les labels** : Si une issue _est_ liée, le bot s'assure que les labels de la PR correspondent exactement à ceux de l'issue. Il ajoutera les labels manquants, supprimera ceux qui ne correspondent pas, et retirera le label `status/need-issue` s'il était présent.
- **Ce que vous devez faire** :
  - **Toujours lier votre PR à une issue.** C'est l'étape la plus importante. Ajoutez une ligne comme `Resolves #<issue-number>` dans la description de votre PR.
  - Cela garantira que votre PR est correctement catégorisée et qu'elle passe en revue sans encombre.

### 4. Traitement continu des issues : `Scheduled Issue Triage`

Il s'agit d'un workflow de secours pour s'assurer qu'aucune issue ne passe à travers le processus de triage.

- **Fichier du workflow** : `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quand il s'exécute** : Toutes les heures sur toutes les issues ouvertes.
- **Ce qu'il fait** :
  - Il recherche activement les issues qui n'ont aucun label ou qui possèdent encore le label `status/need-triage`.
  - Il déclenche ensuite la même analyse avancée basée sur QwenCode que le bot de triage initial afin d'appliquer les bons labels.
- **Ce que vous devez faire** :
  - En général, vous n'avez rien à faire. Ce workflow agit comme file de secours pour garantir que chaque issue sera éventuellement catégorisée, même si le triage initial échoue.

### 5. Automatisation des releases

Ce workflow gère le processus d’empaquetage et de publication des nouvelles versions de Qwen Code.

- **Fichier du workflow** : `.github/workflows/release.yml`
- **Quand il s’exécute** : Selon une planification quotidienne pour les releases "nightly", et manuellement pour les releases officielles de type patch ou mineur.
- **Ce qu’il fait** :
  - Il construit automatiquement le projet, incrémente les numéros de version, et publie les packages sur npm.
  - Il crée une release correspondante sur GitHub avec des notes de version générées automatiquement.
- **Ce que vous devez faire** :
  - En tant que contributeur, vous n’avez rien à faire. Vous pouvez être certain que, une fois votre PR mergée dans la branche `main`, vos modifications seront incluses dans la prochaine release nightly.

Nous espérons que cette vue d’ensemble détaillée vous sera utile. Si vous avez des questions sur notre automatisation ou nos processus, n’hésitez pas à les poser !
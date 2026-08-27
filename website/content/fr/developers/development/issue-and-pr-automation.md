# Processus d'automatisation et de triage

Ce document fournit un aperçu détaillé des processus automatisés que nous utilisons pour gérer et trier les issues et les pull requests. Notre objectif est d'offrir des retours rapides et de garantir que les contributions sont examinées et intégrées efficacement. Comprendre cette automatisation vous aidera, en tant que contributeur, à savoir à quoi vous attendre et comment interagir au mieux avec les bots de notre dépôt.

## Principe directeur : Issues et Pull Requests

Avant toute chose, presque chaque Pull Request (PR) doit être liée à un Issue correspondant. L'Issue décrit le « quoi » et le « pourquoi » (le bug ou la fonctionnalité), tandis que la PR est le « comment » (l'implémentation). Cette séparation nous aide à suivre le travail, hiérarchiser les fonctionnalités et conserver un contexte historique clair. Notre automatisation est construite autour de ce principe.

---

## Workflows d'automatisation détaillés

Voici une description des workflows d'automatisation spécifiques exécutés dans notre dépôt.

### 1. Lorsque vous ouvrez un Issue : `Qwen Triage`

C'est le premier bot avec lequel vous interagirez lorsque vous créez un issue. Son rôle est d'effectuer une analyse initiale et d'appliquer les labels corrects.

- **Fichier du workflow** : `.github/workflows/qwen-triage.yml`
- **Quand il s'exécute** : Immédiatement après la création, la modification ou la réouverture d'un issue, ou lorsqu'un mainteneur demande manuellement le triage.
- **Ce qu'il fait** :
  - Il utilise un modèle Qwen pour analyser le titre et le corps de l'issue par rapport à un ensemble détaillé de directives.
  - **Applique un label `area/*`** : Catégorise l'issue dans un domaine fonctionnel du projet (ex. `area/ux`, `area/models`, `area/platform`).
  - **Applique un label `kind/*`** : Identifie le type d'issue (ex. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applique un label `priority/*`** : Assigne une priorité de P0 (critique) à P3 (faible) en fonction de l'impact décrit.
  - **Peut appliquer `status/need-information`** : Si l'issue manque de détails essentiels (comme des logs ou des étapes de reproduction), il sera marqué pour demander plus d'informations.
  - **Peut appliquer `status/need-retesting`** : Si l'issue fait référence à une version de CLI datant de plus de six versions, il sera marqué pour un nouveau test sur une version actuelle.
- **Ce que vous devez faire** :
  - Remplissez le modèle d'issue aussi complètement que possible. Plus vous fournissez de détails, plus le triage sera précis.
  - Si le label `status/need-information` est ajouté, veuillez fournir les informations demandées dans un commentaire.
  - Les mainteneurs peuvent commenter `@qwen-code /triage` pour relancer le triage.

### 2. Lorsque vous ouvrez une Pull Request : `Continuous Integration (CI)`

Ce workflow garantit que toutes les modifications respectent nos normes de qualité avant de pouvoir être fusionnées.

- **Fichier du workflow** : `.github/workflows/ci.yml`
- **Quand il s'exécute** : À chaque push sur une pull request.
- **Ce qu'il fait** :
  - **Lint** : Vérifie que votre code respecte les règles de formatage et de style de notre projet.
  - **Test** : Exécute l'ensemble de nos tests automatisés sur macOS, Windows et Linux, et sur plusieurs versions de Node.js. C'est la partie la plus longue du processus CI.
  - **Post Coverage Comment** : Une fois tous les tests réussis, un bot publie un commentaire sur votre PR. Ce commentaire fournit un résumé de la couverture de vos modifications par les tests.
- **Ce que vous devez faire** :
  - Assurez-vous que toutes les vérifications CI passent. Une coche verte ✅ apparaîtra à côté de votre commit lorsque tout est réussi.
  - Si une vérification échoue (une croix rouge ❌), cliquez sur le lien « Détails » à côté de la vérification échouée pour consulter les logs, identifier le problème et pousser un correctif.

### 3. Automatisation des publications

Ce workflow gère le processus de packaging et de publication des nouvelles versions de Qwen Code.

- **Fichier du workflow** : `.github/workflows/release.yml`
- **Quand il s'exécute** : Planifié quotidiennement pour les versions « nightly », et manuellement pour les versions officielles (patch ou mineur).
- **Ce qu'il fait** :
  - Construit automatiquement le projet, incrémente les numéros de version et publie les paquets sur npm.
  - Crée une release correspondante sur GitHub avec des notes de version générées automatiquement.
- **Ce que vous devez faire** :
  - En tant que contributeur, vous n'avez rien à faire pour ce processus. Vous pouvez être sûr qu'une fois votre PR fusionnée dans la branche `main`, vos modifications seront incluses dans la prochaine version nightly.

Nous espérons que cet aperçu détaillé vous sera utile. Si vous avez des questions sur notre automatisation ou nos processus, n'hésitez pas à demander !
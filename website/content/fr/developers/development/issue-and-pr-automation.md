# Processus d'automatisation et de triage

Ce document fournit un aperçu détaillé des processus automatisés que nous utilisons pour gérer et trier les problèmes et les demandes de fusion (pull requests). Notre objectif est de fournir un retour rapide et de garantir que les contributions soient examinées et intégrées efficacement. Comprendre cette automatisation vous aidera en tant que contributeur à savoir quoi attendre et comment interagir au mieux avec nos robots de dépôt.

## Principe directeur : Problèmes et Demandes de Fusion

Tout d'abord, presque chaque Demande de Fusion (PR) devrait être liée à un Problème (Issue) correspondant. Le problème décrit le « quoi » et le « pourquoi » (le bogue ou la fonctionnalité), tandis que la PR représente le « comment » (l'implémentation). Cette séparation nous aide à suivre le travail, à prioriser les fonctionnalités et à conserver un contexte historique clair. Notre automatisation est construite autour de ce principe.

---

## Flux de travail automatisés détaillés

Voici une description des flux de travail automatisés spécifiques qui s'exécutent dans notre dépôt.

### 1. Lorsque vous ouvrez une Issue : `Automated Issue Triage`

C’est le premier bot avec lequel vous interagirez lorsque vous créerez une issue. Son rôle est d’effectuer une analyse initiale et d’appliquer les étiquettes appropriées.

- **Fichier de workflow** : `.github/workflows/qwen-automated-issue-triage.yml`
- **Quand il s’exécute** : Immédiatement après la création ou la réouverture d’une issue.
- **Ce qu’il fait** :
  - Il utilise un modèle Qwen pour analyser le titre et le corps de l’issue selon un ensemble détaillé de directives.
  - **Applique une seule étiquette `area/*`** : Classe l’issue dans une zone fonctionnelle du projet (ex. : `area/ux`, `area/models`, `area/platform`).
  - **Applique une seule étiquette `kind/*`** : Identifie le type d’issue (ex. : `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applique une seule étiquette `priority/*`** : Attribue une priorité allant de P0 (critique) à P3 (faible) en fonction de l'impact décrit.
  - **Peut appliquer `status/need-information`** : Si l’issue manque de détails essentiels (comme des journaux ou des étapes de reproduction), elle sera marquée comme nécessitant plus d’informations.
  - **Peut appliquer `status/need-retesting`** : Si l’issue fait référence à une version de l’interface en ligne de commande datant de plus de six versions, elle sera marquée pour être testée à nouveau sur une version actuelle.
- **Ce que vous devez faire** :
  - Remplissez le modèle d’issue aussi complètement que possible. Plus vous fournissez de détails, plus le triage sera précis.
  - Si l’étiquette `status/need-information` est ajoutée, veuillez fournir les informations demandées dans un commentaire.

### 2. Lorsque vous ouvrez une Pull Request : `Intégration Continue (CI)`

Ce workflow garantit que toutes les modifications respectent nos normes de qualité avant de pouvoir être fusionnées.

- **Fichier du workflow** : `.github/workflows/ci.yml`
- **Quand il s'exécute** : À chaque push vers une pull request.
- **Ce qu'il fait** :
  - **Lint** : Vérifie que votre code respecte les règles de formatage et de style de notre projet.
  - **Test** : Exécute la suite complète de tests automatisés sur macOS, Windows et Linux, et sur plusieurs versions de Node.js. C'est la partie la plus longue du processus CI.
  - **Post Coverage Comment** : Une fois que tous les tests ont réussi, un bot publie un commentaire sur votre PR. Ce commentaire fournit un résumé de la couverture de vos modifications par les tests.
- **Ce que vous devez faire** :
  - Vous assurer que toutes les vérifications CI réussissent. Un crochet vert ✅ apparaîtra à côté de votre commit lorsque tout sera réussi.
  - Si une vérification échoue (un « X » rouge ❌), cliquez sur le lien « Details » à côté de la vérification ayant échoué pour consulter les journaux, identifier le problème et pousser un correctif.

### 3. Tri des PR en cours : `Audit des PR et synchronisation des étiquettes`

Ce workflow s'exécute périodiquement pour garantir que toutes les PR ouvertes sont correctement liées aux issues et possèdent des étiquettes cohérentes.

- **Fichier du workflow** : `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Fréquence d'exécution** : Toutes les 15 minutes sur toutes les pull requests ouvertes.
- **Actions effectuées** :
  - **Vérification de la liaison à une issue** : Le bot analyse la description de votre PR à la recherche d'un mot-clé qui la lie à une issue (par exemple, `Fixes #123`, `Closes #456`).
  - **Ajout de l'étiquette `status/need-issue`** : Si aucune issue liée n'est trouvée, le bot ajoutera l'étiquette `status/need-issue` à votre PR. Cela indique clairement qu'une issue doit être créée et associée.
  - **Synchronisation des étiquettes** : Si une issue _est_ liée, le bot s'assure que les étiquettes de la PR correspondent parfaitement à celles de l'issue. Il ajoutera les éventuelles étiquettes manquantes, supprimera celles qui ne conviennent pas, et retirera l'étiquette `status/need-issue` si elle était présente.
- **Ce que vous devez faire** :
  - **Toujours lier votre PR à une issue.** C’est l’étape la plus importante. Ajoutez une ligne comme `Resolves #<numéro-de-l’issue>` dans la description de votre PR.
  - Cela permettra de catégoriser correctement votre PR et de faciliter son passage dans le processus de revue.

### 4. Traitement continu des problèmes : `Scheduled Issue Triage`

Il s'agit d'un flux de travail de secours destiné à garantir qu'aucun problème ne soit omis par le processus de traitement.

- **Fichier du flux de travail** : `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Fréquence d'exécution** : Toutes les heures sur tous les problèmes ouverts.
- **Actions effectuées** :
  - Il recherche activement les problèmes qui n'ont aucune étiquette ou qui possèdent encore l'étiquette `status/need-triage`.
  - Il déclenche ensuite la même analyse avancée basée sur QwenCode que celle utilisée par le robot de traitement initial afin d'appliquer les étiquettes appropriées.
- **Actions recommandées** :
  - En général, vous n'avez rien à faire. Ce flux de travail constitue un filet de sécurité pour s'assurer que chaque problème finira par être catégorisé, même si le traitement initial échoue.

### 5. Automatisation des publications

Ce workflow gère le processus d’empaquetage et de publication de nouvelles versions de Qwen Code.

- **Fichier du workflow** : `.github/workflows/release.yml`
- **Quand il s’exécute** : Selon une planification quotidienne pour les versions « nightly », et manuellement pour les versions correctives ou mineures officielles.
- **Ce qu’il fait** :
  - Compile automatiquement le projet, incrémente les numéros de version, et publie les paquets sur npm.
  - Crée une release correspondante sur GitHub avec des notes de version générées automatiquement.
- **Ce que vous devez faire** :
  - En tant que contributeur, vous n’avez rien à faire dans ce processus. Vous pouvez être certain que dès que votre pull request est fusionnée dans la branche `main`, vos modifications seront incluses dans la prochaine version nightly.

Nous espérons que cette vue d’ensemble détaillée vous sera utile. Si vous avez des questions concernant notre automatisation ou nos processus, n’hésitez pas à les poser !
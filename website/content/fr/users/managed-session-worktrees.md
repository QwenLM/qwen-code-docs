# worktrees de Session Managed


Dans un déploiement Managed local pris en charge, sélectionnez un projet Git lors de la création d'une Session. Ouvrez le bouton de branche Git à côté du workspace sous le composer et choisissez **Worktree**. Le sélecteur se ferme ; l'envoi de votre premier message crée automatiquement un checkout isolé à partir du HEAD courant sur sa propre branche. Il n'y a pas de formulaire de branche ou de répertoire à remplir. Les fichiers non commités, la configuration ignorée et les dépendances installées restent dans le répertoire source.

Avant l'envoi, choisissez **Current branch** ou effacez le chip Worktree pour travailler directement sur la branche source. Le chip affiche la branche source réelle, comme **main**, lorsque l'isolation n'est pas sélectionnée.

La Session signale la préparation et peut attendre d'autres outils utilisant le même
stockage. Les références de fichiers et les uploads de Workspace deviennent disponibles après que le
worktree est prêt. Les instructions de projet proviennent du répertoire cible ; les paramètres Managed
de modèle, d'approbation, de Skills, de MCP et d'Extensions conservent leurs épingles de Session.

Dans le chat Home, la carte plus-d'informations de la session contient le statut du worktree, la branche et le commit de base. Les détails du worktree prêt n'occupent plus le haut de la conversation ; les messages de préparation et d'erreur y restent visibles si nécessaire.

La fermeture, l'archivage ou la suppression du chat conserve le checkout et la branche. Ouvrez
**worktrees de Session** depuis le popover composer de nouvelle tâche du même Workspace pour inspecter les répertoires conservés. Fermez
la Session et terminez son travail en arrière-plan avant le nettoyage. Commitez ou autrement
enregistrez le contenu suivi/non suivi/ignoré d'abord. Le nettoyage supprime uniquement un checkout
propre et conserve toutes les branches ; il ne fusionne pas les modifications dans la source.

Les déploiements activent `qwen.managed-agent.runtime-broker.session-worktrees-enabled`.
Désactivé par défaut ; `qwen serve --managed` active les hôtes locaux éligibles. Cette version
prend en charge le stockage LOCAL macOS/Linux, les workers de processus local durables isolés par Session et Git 2.40 ou ultérieur. Le dépôt et son répertoire commun Git doivent
se trouver dans la racine de stockage enregistrée. Pour un checkout lié existant avec des métadonnées Git
ailleurs, sélectionnez le checkout original ou demandez à l'administrateur d'
enregistrer une racine contenant les deux. SSH et CSI ne sont pas pris en charge dans cette version.

Le redémarrage d'une Session prête réutilise son checkout original. Les répertoires manquants ou remplacés
bloquent l'exécution. Si le serveur est arrêté pendant que Git crée ou
supprime un worktree, un processus Git original non vérifié laisse l'opération
bloquée et son maintien de maintenance intact. Le recontrôle ne force pas la récupération ;
la récupération automatique macOS pour ce cas est en dehors de cette version. Préservez le
répertoire et la branche jusqu'à ce que l'exécution originale puisse être réconciliée.

La requête publique de création de Session ajoute `worktree: {"base_ref":"main"}` ;
`worktree: {}` sélectionne HEAD et l'omission utilise le répertoire courant. Envoyez un
`workspace` autorisé explicite et conservez la même Idempotency-Key lors de la nouvelle tentative.
Interrogez le `worktree.state` de la Session retournée avant d'envoyer une entrée ultérieure.

Cette version de développement met à jour la baseline de schéma V1 partagée. Utilisez un
catalogue de développement recréé à partir de cette baseline ; une migration de mise à niveau pour un
catalogue plus ancien n'est pas incluse.
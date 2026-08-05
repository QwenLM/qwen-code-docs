# Modèle de runtime de gestion MCP

La configuration MCP est la source de vérité durable. Chaque session CLI ou
Web continue de posséder un runtime MCP indépendant afin que la CLI ne
dépende pas d'un processus de gestion de workspace.

La page de gestion Web peut créer un runtime de gestion optionnel pour les
opérations de statut et de gestion. Les opérations qui modifient la
configuration persistent d'abord, puis réconcilient chaque runtime live du
même processus ACP. Une session ultérieure charge la configuration persistée
normalement.

Le statut de gestion est lu depuis le gestionnaire de clients du runtime de
gestion, pas depuis la carte de statut de compatibilité à l'échelle du
processus. La carte de compatibilité reste inchangée pour les consommateurs
CLI existants. Les reconnexions du pool partagé redémarrent l'entrée du
pool ; les reconnexions hors pool redécouvrent le serveur dans chaque runtime
live.

La provenance des serveurs reste distincte : settings utilisateur, settings
de workspace, `.mcp.json` du projet et extensions. La désactivation des
serveurs de projet ou de workspace écrit l'exclusion dans les settings
locaux au workspace sans modifier le fichier de projet partagé.

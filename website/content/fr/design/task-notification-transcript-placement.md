# Placement des notifications de tâche dans la transcription

Les complétions de tâche en arrière-plan sont des entrées du modèle, pas des
prompts rédigés par l'utilisateur. Le chemin du démon live les identifie déjà
avec `_meta.source = "background_notification"`, mais la relecture
d'historique projetait auparavant les enregistrements de notification
persistés comme des messages utilisateur non marqués.

La relecture d'historique préserve le rôle d'entrée du modèle persisté tout
en ajoutant le même marqueur de source que celui utilisé par les
notifications live. L'adaptateur de transcription du Web Shell mappe cette
source, depuis un chunk utilisateur ou assistant, vers un message système
informationnel. Les nouveaux enregistrements persistent également le statut
de tâche structuré existant afin que les messages live et relus utilisent la
même étiquette completed, failed ou cancelled ; les enregistrements plus
anciens retombent sur une étiquette de notification générique. Le contenu de
la notification est rendu inchangé à côté d'une icône de statut sémantique.
Cela garde les notifications live et relues visibles sur la gauche sans
modifier la sémantique de relecture partagée des autres consommateurs.

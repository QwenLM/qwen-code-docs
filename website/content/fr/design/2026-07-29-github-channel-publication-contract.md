# Contrat de publication du canal GitHub

## Objectif

Rendre les réponses du canal GitHub sûres à publier automatiquement et
traçables après coup. Le canal ne publie que la réponse finale de l'agent via
l'adaptateur ; le raisonnement intermédiaire, les sorties d'outil et les
chunks de streaming ne deviennent jamais des commentaires GitHub.

## Contrat

- L'adaptateur GitHub désactive le streaming de blocs, de sorte que chaque
  événement entrant accepté produit au plus une tentative de remise de
  réponse finale.
- La remise finale utilise le thread issue/PR du prompt actif plutôt qu'une
  cible de session partagée potentiellement obsolète.
- Les instructions du canal indiquent à l'agent de ne pas utiliser `gh` ou
  l'API GitHub pour créer des commentaires ou des revues. L'adaptateur possède
  la remise publique.
- Une réponse finale dont le contenu rogné n'est que la sentinelle
  `<no-reply/>` est intentionnellement supprimée. Les espaces, la casse, un
  espace avant `/>` et une seule clôture de code fence englobante sont
  normalisés ; tout autre contenu est publié inchangé.
- La suppression et la publication sont enregistrées dans un fichier d'audit
  JSONL local en ajout seul, à
  `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-audit.jsonl`.
  Les enregistrements contiennent l'heure, le canal, la session, le message
  source, le thread, l'issue, l'identité/URL du commentaire GitHub quand elle
  existe, et un SHA-256 plus le nombre de caractères de la réponse. Ils ne
  contiennent jamais le texte de la réponse, des identifiants ou un token
  GitHub.
- Les écritures d'audit sont best effort. Un échec d'audit est journalisé sans
  modifier le résultat de publication. Un échec d'API GitHub ambigu reste un
  échec de remise et n'est pas retenté ; les réponses sans écriture certaine
  sont écrites dans un fichier privé de remises en attente et retentées au
  prochain démarrage du canal.

## Flux

1. L'adaptateur GitHub dispatche un événement accepté dans `ChannelBase`.
2. Le prompt actif garde le message entrant et le thread issue/PR disponibles
   jusqu'à la fin de la remise finale.
3. L'agent retourne une réponse finale unique.
4. L'adaptateur supprime la sentinelle exacte ou crée un commentaire d'issue.
5. L'adaptateur ajoute un enregistrement d'audit de publication. Le cycle de
   vie terminal de la tâche reste possédé par `ChannelBase`.
6. Si la remise finale échoue avec une réponse sans écriture certaine,
   l'adaptateur stocke le texte final dans
   `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
   avec des permissions de fichier privées et le retente après redémarrage
   sans réexécuter l'agent.

## Non-objectifs

- Cela ne retente pas les échecs de publication ambigus, ne crée pas de
  commentaires de statut et n'active pas le streaming de réponses. Ce sont des
  parties séparées de l'issue #8012.
- L'instruction contre la publication directe via `gh`/API est une frontière
  opérationnelle pour l'agent, pas une application de sandbox. L'application
  des restrictions d'écriture GitHub au niveau des outils relève du modèle de
  permissions du runtime.
- La politique de rétention des remises en attente, y compris le nombre maximal
  de tentatives, l'âge maximal, les plafonds de taille, le traitement des
  réponses obsolètes et le nettoyage des fichiers temporaires orphelins, est
  suivi séparément dans #8142.

## Vérification

Les tests ciblés de l'adaptateur GitHub couvrent la suppression de la
sentinelle, la remise d'un commentaire final normal, les champs d'audit sans
texte de réponse et les échecs d'écriture d'audit non bloquants. Les tests de
routage et de remise existants restent inchangés.

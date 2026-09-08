# Verrous et récupération du writer de Conversations

Les démons mis à jour peuvent partager Conversations et utiliser différentes sessions en même temps. Une session chargée n'a toujours qu'un seul writer. L'activation live appartient uniquement à l'éditeur exact du localisateur Live stable ; perdre la publication Live ne désactive pas les conversations autonomes.

## Une conversation ne s'ouvre pas

`session_writer_conflict` signifie que la fence du writer a empêché l'accès. Cela peut signifier qu'un autre processus a la conversation ouverte, ou qu'un verrou résiduel ne peut pas être récupéré en toute sécurité. Ce n'est pas la preuve qu'un autre writer est actuellement actif. `session_writer_unavailable` signifie que la propriété n'a pas pu être vérifiée ; réessayer n'autorise pas à la contourner. Archive et delete peuvent retourner HTTP 200 avec une erreur de writer pour une session individuelle. Vérifiez chaque élément de résultat.

Fermez la conversation normalement dans le processus Qwen propriétaire, puis utilisez **Try again** dans la conversation affectée. Vous pouvez continuer à utiliser d'autres sessions. Ne créez pas une conversation de remplacement simplement pour faire disparaître l'erreur.

Après un arrêt non gracieux, un redémarrage Linux ou un redémarrage de conteneur dans un nouvel espace de noms PID peut laisser un enregistrement writer actif non scellé sous fence indéfiniment. Il peut ne pas y avoir de propriétaire survivant pour fermer. Suivez la procédure [Operator recovery for a residual lock](#operator-recovery-for-a-residual-lock) au lieu de réessayer répétitivement ; cette version ne récupère pas automatiquement au-delà de ces frontières d'identité.

Si le problème persiste, activez la journalisation de débogage locale (`QWEN_DEBUG_LOG_FILE=1`) au démarrage du démon affecté et examinez les diagnostics du démon et de l'enfant ACP. Les diagnostics d'acquisition de bail incluent l'ID de session, le type d'erreur et le `lockPath` exact résolu depuis le stockage runtime de ce writer. Ne devinez pas un chemin de verrou depuis le workspace principal ou un répertoire home par défaut. Les erreurs HTTP/ACP publiques omettent intentionnellement les chemins et les enregistrements de propriété. Conservez les fichiers de diagnostic en privé ; ne publiez pas de tokens de propriétaire ni de contenus de verrou non expurgés.

## Quel état peut être récupéré automatiquement ?

Ces règles s'appliquent aux bails de writer de session. Les enregistrements globaux de propriétaire legacy utilisent la vérification de compatibilité plus limitée décrite ci-dessous.

- Une fermeture normale libère le bail. Une transmission scellée certifiée n'est acceptée que lorsque sa preuve de transcription est encore valide.
- Un writer actif mort n'est récupérable que lorsque les vérifications d'identité existantes établissent que son processus appartient au même domaine de vie vérifié.
- Les writers live ou bloqués restent sous fence. Tuer un démon est insuffisant si son enfant writer ACP survit.
- Une identité de boot ou d'espace de noms de processus étrangère ou absente n'est pas une preuve de mort. Un PID absent dans votre espace de noms ne prouve pas qu'un writer étranger s'est terminé.
- Les enregistrements malformés, l'identité de transcription incertaine et les revendications de transition résiduelles sont en fail closed. Le temps écoulé seul n'autorise jamais la prise de contrôle.

## Récupération par l'opérateur d'un verrou résiduel

1. Identifiez la session et le stockage affectés exacts à partir des diagnostics locaux. Préservez le log de défaillance et une sauvegarde privée de ses artifacts de transcription et de verrou. Notez quels binaires et hôtes peuvent accéder à ce stockage.
2. Arrêtez ou fencez **tous les writers possibles**, y compris les enfants ACP détachés, les autres démons, conteneurs, espaces de noms et machines partageant le filesystem. Vérifiez la fence depuis l'hôte ou l'espace de noms pertinent. Si vous ne pouvez pas établir cela, arrêtez-vous ici et demandez à un opérateur qui le peut.
3. Examinez l'enregistrement exact et tous les artifacts de revendication ou retirés associés avec un mainteneur. Déterminez si la dernière transcription et la preuve de transmission font autorité. Ne modifiez pas les champs d'identité de propriété pour fabriquer une correspondance.
4. Uniquement après avoir fenceé les writers et sauvegardé les preuves, déplacez les artifacts résiduels vérifiés individuellement vers un stockage de récupération privé sous supervision d'opérateur. Ne supprimez jamais récursivement un répertoire de verrou ni ne supprimez tous les verrous.
5. Démarrez un seul démon mis à jour, restaurez la session d'origine et vérifiez son dernier tour enregistré avant d'ajouter. Conservez les sauvegardes jusqu'à ce que la continuité soit confirmée. Ne ramenez les autres démons mis à jour qu'après cette vérification.

Il n'y a pas d'API de déverrouillage forcé ni de prise de contrôle automatique cross-boot/TTL dans cette version. Lorsque la propriété sûre ne peut pas être établie, maintenez la fence.

## Mise à niveau et rollback coordonnés

La bascule backend et les modifications d'erreur locale/réessai du Web Shell doivent être livrées dans la même version. Ce n'est **pas une mise à niveau rolling en version mixte** : les anciens démons peuvent créer un propriétaire global après qu'un démon mis à jour a déjà démarré.

Avant la mise à niveau, drainez toutes les anciennes sessions et le travail planifié, arrêtez tous les anciens démons et leurs enfants ACP, préservez les données runtime, puis démarrez les binaires mis à jour. Un démon mis à jour rencontrant un propriétaire legacy live retourne `503 conversation_runtime_in_use` ; après la sortie de ce propriétaire, réessayez sans redémarrer. Seul un enregistrement legacy obsolète exactement revalidé est retiré. Un état legacy malformé ou non sûr nécessite une investigation par l'opérateur.

L'enregistrement legacy `conversations/runtime-owner.json` porte un PID et un nonce, mais pas de nom d'hôte, d'ID de boot ni d'identité d'espace de noms PID. Sa vérification de compatibilité peut seulement tester si ce PID existe dans l'hôte et l'espace de noms PID propres au démon mis à jour. Il ne peut pas détecter un ancien writer actif ailleurs sur un stockage partagé. C'est une autre raison de fenceer tous les writers possibles avant de démarrer un démon mis à jour ; la vérification ne rend pas les mises à niveau multi-hôtes ou multi-espaces de noms sûres.

Avant le rollback, drainez et fencez également tous les démons et writers mis à jour. Inventoriez les enregistrements actifs, scellés, de revendication, retirés et de schéma étendu. Confirmez que le binaire cible comprend chaque schéma conservé et chaque état de transmission ; ne soumettez jamais un schéma non supporté à un ancien writer ni ne supprimez son enregistrement de protection pour faire avancer le rollback. Si la compatibilité ne peut pas être établie, gardez les writers arrêtés et utilisez la récupération guidée par le mainteneur ou la sauvegarde pré-mise à niveau cohérente. Ne restaurez jamais une ancienne transcription sur des tours ultérieurs faisant autorité sans tenir explicitement compte de ces tours.
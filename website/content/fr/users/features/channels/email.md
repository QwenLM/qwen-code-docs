# Email

Utilisez une boîte mail dédiée pour envoyer des tâches à Qwen Code via IMAP et recevoir des réponses SMTP en texte brut. La première connexion ignore les mails déjà présents dans le dossier sélectionné. Les connexions suivantes reprennent au curseur UID enregistré.

## Configuration et démarrage

Activez IMAP et SMTP pour la boîte mail et exportez ses identifiants dans l'environnement du processus exécutant Qwen Code. Ajoutez ce channel à `settings.json` :

```json
{
  "channels": {
    "agent-mail": {
      "type": "email",
      "address": "agent @example.com",
      "imapHost": "imap.example.com",
      "imapUser": "agent @example.com",
      "imapPassword": "$AGENT_IMAP_PASSWORD",
      "smtpHost": "smtp.example.com",
      "smtpUser": "agent @example.com",
      "smtpPassword": "$AGENT_SMTP_PASSWORD",
      "privatePolicy": "allowlist",
      "allowedUsers": ["you @example.com"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/workspace"
    }
  }
}
```

Exécutez `qwen channel start agent-mail`. Les champs de mot de passe supportent les références `$ENV_VAR` existantes ; gardez les mots de passe en clair hors des settings. L'adaptateur désactive la journalisation de protocole et signale les échecs de connexion sans transmettre les identifiants.

TLS implicite utilise par défaut le port IMAP 993 et le port SMTP 465. Pour STARTTLS, définissez `imapSecure` ou `smtpSecure` à `false` ; les ports par défaut deviennent respectivement 143 et 587. STARTTLS et la vérification de certificat restent obligatoires. Surchargez `imapPort` et `smtpPort` si nécessaire. Pour une CA privée, configurez `NODE_EXTRA_CA_CERTS` de Node avant de lancer Qwen Code.

| Option                | Par défaut | Signification                                                              |
| --------------------- | ---------- | -------------------------------------------------------------------------- |
| `folder`              | `INBOX`    | Un seul dossier IMAP en lecture seule                                      |
| `pollInterval`        | `60000`    | Intervalle de polling en millisecondes                                     |
| `maxMessageBytes`     | `10485760` | Taille maximale du message brut ; les messages plus grands sont ignorés    |
| `maxAttachmentBytes`  | `5242880`  | Taille maximale d'une pièce jointe individuelle ; les pièces jointes plus grandes sont omises |
| `maxTextLength`       | `32000`    | Nombre maximal de caractères de texte avant l'écrêtage de l'historique cité et de la signature |
| `proactiveRecipients` | `[]`       | Adresses de boîte mail nues exactes autorisées pour la livraison proactive |

Au maximum 16 pièces jointes sont transmises. Les images PNG, JPEG, GIF et WebP utilisent l'entrée image existante ; les autres fichiers sont stockés sous des chemins privés générés pour la durée de la tâche. Les parties calendrier, message encapsulé et rapport ne sont pas supportées. Le HTML est converti en texte sans charger de ressources distantes. Les options de channel communes `cwd`, `model`, `instructions` et `sessionScope` s'appliquent. Le scope `chat_thread` par défaut sépare les expéditeurs et les fils ; choisir `single` partage explicitement une session agent.

## Accès et réponses

`privatePolicy` supporte `allowlist` (par défaut), `open` et `disabled` ; l'ancien `senderPolicy` est également reconnu. L'appairage n'est pas supporté dans cette première version. Les adresses dans `allowedUsers` et `operators` sont normalisées en minuscules ; les noms d'affichage n'accordent pas l'accès. Les adresses ASCII nues sont supportées. Utilisez un fournisseur de boîte mail qui filtre les mails falsifiés : une allowlist From n'authentifie pas l'expéditeur.

Répondez à l'email de l'agent pour continuer la conversation. `Message-ID`, `In-Reply-To` et `References` associent la conversation à son expéditeur. Les réponses ciblent cet expéditeur seul ; `Reply-To`, CC, BCC et les adresses dans la tâche ne peuvent pas modifier les destinataires SMTP. Les résultats des tâches en arrière-plan répondent via le fil accepté enregistré après la fin du tour initiateur. Les expéditeurs ne-pas-répondre peuvent lancer des tâches mais ne reçoivent aucune réponse. Les mails générés par l'agent, automatiques, de liste de diffusion et de rapport de livraison sont ignorés.

Les commandes texte telles que `/help`, `/status` et les réponses de permission fonctionnent dans le corps de l'email. L'email utilise `followup` par défaut et supporte `steer`. `collect` est rejeté car les messages en tampon survivent à leur gestionnaire d'admission et ne peuvent pas conserver une revendication de complétion durable individuelle. L'admission reste active pendant qu'une tâche attend. Jusqu'à 32 livraisons ordinaires peuvent être en cours ; un slot supplémentaire permet les réponses de contrôle et les réponses d'occupation. Les nouvelles tâches à capacité reçoivent une demande de renvoi après la fin d'une tâche active.

La livraison proactive est désactivée sauf si `proactiveRecipients` contient la cible exacte. Une cible proactive en fil doit également correspondre à un expéditeur/fil connu et actuellement autorisé. Les cibles inconnues échouent sans sélectionner un autre destinataire ni créer de fil de remplacement. L'adaptateur conserve 256 routes de réponse récentes, jusqu'à 64 identifiants par route, et 1024 identités entrantes récentes. La progression UID IMAP continue de prévenir la relecture des anciennes livraisons après l'expiration de ces entrées de métadonnées ; une route de fil évincée ne peut pas recevoir de réponses proactives jusqu'à ce qu'un autre message accepté la restaure.

## Récupération

L'état réside sous `$QWEN_HOME/channels/<workspace>/email-<account-hash>/state.json` (QWEN_HOME par défaut est `~/.qwen`). Le nom du channel, le workspace canonique et le point de terminaison/utilisateur/dossier de la boîte mail déterminent le store. Un seul processus peut le posséder. Changer de compte établit une baseline séparée ; les changements de UIDVALIDITY ignorent également le contenu existant du dossier.

L'adaptateur persiste un UID en cours avant de démarrer une tâche et un ID de message `outboundPending` avant chaque envoi SMTP, y compris les envois proactifs. Il supprime chaque enregistrement après la fin de l'opération correspondante. Si le processus s'arrête pendant l'exécution ou si SMTP retourne un résultat incertain, l'enregistrement reste. Le redémarrage signale le chemin d'état, les UID en attente et les ID de messages sortants et refuse de les rejouer. Arrêtez le channel, inspectez la boîte mail et les effets de bord de la tâche, et supprimez uniquement les UID réconciliés du tableau `pending` de l'état et les ID sortants réconciliés de `outboundPending` avant de redémarrer. Gardez le curseur et les métadonnées de fil intacts. Ne supprimez pas le fichier d'état comme mécanisme de retry : son absence crée une nouvelle baseline et ignore les mails existants.

Les identifiants de fil email et la progression d'admission survivent au redémarrage. La restauration de l'historique de l'agent suit le runtime du channel : le chemin autonome `channel start` actuel ne restaure pas ses sessions agent enregistrées au démarrage à froid, tandis que les workers du démon restaurent leurs routes.

Les effets de bord de l'agent, l'acceptation SMTP et un curseur local ne peuvent pas être commités en une seule transaction. Arrêter le channel bloque les tours en file d'attente avant qu'ils ne démarrent le travail de l'agent. Les opérations déjà en cours dans l'agent peuvent tout de même se terminer. Cette politique de récupération évite la ré-exécution automatique de travail incertain ; elle nécessite une réconciliation par l'opérateur après interruption. Un état corrompu/inlisible arrête également le démarrage. Les anciens répertoires de pièces jointes sont supprimés après la réconciliation et avant de recevoir du nouveau travail.

L'OAuth fournisseur, la sortie HTML riche, la gestion de boîte mail, S/MIME, PGP et la gestion de calendrier sont hors du scope de cette version.
# Protocole inter-sessions

Cette page est le contrat pour un programme qui souhaite participer à la
messagerie inter-sessions sans être une session Qwen Code : un front-end
vocal, un démon relais, un script qui surveille un build. Elle décrit ce
qu'une session écrit dans le registre, ce que sa boîte de réception lit
sur une connexion, et ce qu'elle renvoie. Tout ce qui est décrit ici
correspond à ce que le code fait aujourd'hui, au schema version 1 et
frame version 1 ; la dernière section indique ce qui peut changer et
comment vous en serez informé.

Toute valeur qui traverse une frontière de processus est considérée comme
non fiable à l'arrivée et validée par le lecteur. Lorsque cette page
indique qu'un champ « doit » avoir une certaine forme, une valeur qui ne
la respecte pas est supprimée, jamais rejetée avec une erreur.

## 1. Le registre de sessions

Une session en cours publie un enregistrement :

```
$QWEN_HOME/sessions/<pid>.json            (répertoire 0700, fichier 0600)
$QWEN_HOME/sessions/<pid>-<8 hex>.json    (un processus hébergeant plusieurs sessions)
```

`$QWEN_HOME` vaut par défaut `~/.qwen`. Le nom de fichier est indexé par le PID de
l'écrivain — soit le PID seul, soit le PID, un tiret et huit caractères
hexadécimaux minuscules générés à l'inscription (voir « Plusieurs
enregistrements pour un processus » ci-dessous). Un enregistrement dont
le champ `pid` ne correspond pas au préfixe PID de son nom de fichier —
comparé en forme décimale canonique, donc un nom avec des zéros initiaux
ne correspond à rien — est ignoré.

```json
{
  "schemaVersion": 1,
  "pid": 41337,
  "procStart": "a1b2c3d4-…-boot-uuid:8895124",
  "pidNs": 4026531836,
  "sessionId": "8e016be8-5b48-4c13-ad22-1f5326ae64ac",
  "cwd": "/home/me/project",
  "name": "project-3f",
  "startedAt": 1788959000000,
  "qwenVersion": "0.23.0",
  "kind": "tui",
  "ipcPath": "/run/user/1000/qwen-socks/41337.sock",
  "ipcToken": "c0ffee…64 hex…"
}
```

| Champ           | Signification                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Toujours `1`. Un lecteur saute un enregistrement dont la version est supérieure et ne le supprime jamais.                                                                                                                                                                                             |
| `pid`           | L'identifiant de processus de l'écrivain. Doit être égal au PID indexé par le nom de fichier : le nom entier pour la forme nue, les chiffres avant le suffixe `-<8 hex>` pour la forme générée.                                                                                                          |
| `procStart`     | `<boot id>:<process start ticks>` sur Linux (`/proc/sys/kernel/random/boot_id` et champ 22 de `/proc/<pid>/stat`) ; `null` ailleurs. Protège contre la réutilisation de PID et contre les enregistrements écrits sur une autre machine partageant ce répertoire home.                                |
| `pidNs`         | Numéro d'inode de `/proc/self/ns/pid` sur Linux ; `null` ailleurs. Un lecteur ne liste et ne nettoie que les enregistrements de son propre namespace.                                                                                                                                                 |
| `sessionId`     | L'identifiant de session. `/clear` et `/resume` le remplacent sous le même PID, donc relisez l'enregistrement avant chaque envoi.                                                                                                                                                                     |
| `cwd`           | Répertoire de travail à l'inscription.                                                                                                                                                                                                                                                                |
| `name`          | Nom d'affichage. Dérivé du nom de base du cwd (lettres Unicode, marques, chiffres, `.`, `_`, `-` ; jusqu'à 32 points de code) suivi de `-` et des deux premiers caractères hex de `sha256(sessionId)`, sauf si l'écrivain en a choisi un. Pas unique.                                                |
| `startedAt`     | Millisecondes depuis l'epoch. Les plus récents en premier pour l'ordre d'affichage et pour départager les jumeaux.                                                                                                                                                                                    |
| `qwenVersion`   | Texte libre ou `null`.                                                                                                                                                                                                                                                                                |
| `kind`          | Ce qui s'est inscrit : `tui` (quelqu'un devant un terminal), `headless`, `serve`, `external`. ASCII minuscule, chiffres et tirets, 16 caractères maximum ; tout le reste est supprimé à la lecture. Absent signifie un écrivain antérieur à ce champ, lu comme `tui`. Un label pour les listes — jamais un identifiant ; voir ci-dessous. |
| `ipcPath`       | Le socket de la boîte de réception, présent uniquement tant qu'il est lié. Absent signifie découvrable mais non joignable par message.                                                                                                                                                                |
| `ipcToken`      | 64 caractères hex. Ce qu'une connexion vers `ipcPath` présente sur sa ligne d'authentification. Absent signifie que la boîte de réception n'en exige pas (enregistrements de versions antérieures).                                                                                                  |

**Un enregistrement est une auto-déclaration.** Chaque champ a été écrit
par le processus qu'il décrit, donc `name`, `cwd` et `kind` sont des
revendications, pas des faits sur lesquels un lecteur peut se fier. Rien
de ce qui détermine ce qu'un expéditeur peut faire ne les lit — cela est
réglé par ce qu'une connexion présente (§3) et par la politique propre de
la session réceptrice (§6). Définissez `kind` pour qu'un listing puisse
grouper les sessions honnêtement ; ne vous attendez pas à ce que cela
vous apporte quoi que ce soit.

**Écrire votre propre enregistrement.** Un processus externe qui souhaite
être trouvé — listé par `qwen sessions ps`, adressable depuis
`send_message`, capable de recevoir des accusés de réception — écrit le
même enregistrement pour lui-même : son propre `pid`, `procStart` et
`pidNs` calculés de la même manière, un `sessionId` qu'il génère
(n'importe quel UUID), `kind: "external"`, un `name` (le vôtre, ou
dérivé de la même manière ; il est aplati sur une ligne et borné lors de
l'affichage), et `ipcPath` + `ipcToken` pour une boîte de réception
qu'il lie lui-même (§2). Écrivez dans un fichier temporaire du même
répertoire puis faites un `rename` sur la cible ; créez le fichier en
0600 ; refusez d'écrire à travers un lien symbolique. Supprimez
l'enregistrement à la sortie. Un enregistrement dont le processus a
disparu est nettoyé par la prochaine session qui liste, mais uniquement
lorsque `procStart` prouve que le PID n'est pas simplement réutilisé.

**Lecture.** Tout ce qui peut lire le répertoire peut lire chaque
enregistrement, y compris les jetons : pouvoir découvrir une session et
pouvoir s'y authentifier sont une seule et même capacité par
conception. N'affichez pas `ipcToken` là où un modèle ou un log pourrait
le voir.

**Liveness.** Un enregistrement est actif lorsque toutes ces conditions
sont remplies : le nom de fichier est `<pid>.json` ou `<pid>-<8 hex>.json` et son préfixe PID est égal à `pid` ; `pidNs` est égal
à celui du lecteur ; le boot id dans `procStart` est égal à celui du
lecteur (ou `procStart` est `null`) ; et le PID est actif avec les mêmes
ticks de démarrage. Un enregistrement actif avec un `ipcPath` doit
encore être composé avant d'être annoncé comme joignable — un fichier
socket survit à un crash.

**Refs.** Les handles affichés utilisent `ref = sha256(sessionId)[0:6]`.
Deux sessions peuvent partager un `name` ; la grammaire d'adresse qu'un
expéditeur saisit est `name`, `name [ref]`, `[ref]` ou le `ref` seul, et
un `name` ambigu est une erreur plutôt qu'une supposition.

**Plusieurs enregistrements pour un processus.** Tout enfant `qwen --acp` — lancé
par le démon, ou piloté directement par un éditeur ou un autre client —
écrit un enregistrement par session, nommé `<pid>-<8 hex>.json`, dès sa
première session. Le suffixe est généré à l'inscription et ne change
jamais ; un id de session changé en dessous est un correctif de
l'enregistrement, pas un renommage. Chacun d'eux porte le même
`ipcPath`, car le processus lie une seule boîte de réception pour toutes
ses sessions et les distingue par le `toSessionId` de chaque frame —
donc **envoyez toujours `toSessionId`** : une frame sans ce champ qui
atteint un tel processus reçoit une réponse `misaddressed`, car il n'y a
pas de session unique à laquelle elle pourrait correspondre. La liveness,
le nettoyage et les gardes de namespace et de boot lisent
l'enregistrement exactement comme pour le nom nu ; seule la
vérification de correspondance PID/nom de fichier diffère, et uniquement
en comparant `pid` avec les chiffres avant le suffixe plutôt qu'avec le
nom entier.

## 2. Le socket de la boîte de réception

Un socket de domaine UNIX par session, au premier de ceux-ci qui peut se
lier :

1. `$XDG_RUNTIME_DIR/qwen-socks/<pid>.sock`
2. `$TMPDIR/qwen-socks-<16 hex>/<pid>.sock`
3. `/tmp/qwen-socks-<16 hex>/<pid>.sock`

Le répertoire est en 0700 et le socket en 0600. Un chemin de plus de 103
octets est ignoré. Lorsque le nom indexé par PID est déjà occupé par un
listener actif (deux namespaces de PID partageant un répertoire runtime),
la session lie `<pid>-<8 hex>.sock` à côté à la place. Les pairs ne
déduisent jamais un chemin de socket ; ils lisent `ipcPath` depuis
l'enregistrement.

Une connexion transporte du JSON délimité par des nouvelles lignes, un
objet par ligne, en UTF-8. Une seule ligne de plus de 1 MiB (mesurée en
unités de code UTF-16) coupe la connexion. Une connexion qui reste 30
secondes sans compléter une ligne analysable est coupée ; les lignes
inutiles ne prolongent pas le délai. Le listener accepte au maximum 64
connexions simultanées.

L'échange attendu est d'un message par connexion : se connecter, écrire
la ligne d'authentification et la frame en une seule écriture, fermer
partiellement, attendre que le pair ferme. Le récepteur n'écrit jamais
sur la même connexion ; tout ce qu'il a à dire revient sous forme d'une
connexion séparée vers votre propre `ipcPath`.

## 3. La ligne d'authentification

Lorsque l'enregistrement cible a un `ipcToken`, la première ligne doit
être :

```json
{ "msgV": 1, "type": "auth", "token": "<token>" }
```

Trois types de jeton sont acceptés, et la boîte de réception mémorise
celui qu'elle a vu :

| Présenté                                                                        | La boîte de réception conclut  | Effet                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Le `ipcToken` de l'enregistrement de registre de la cible                       | un pair ordinaire              | soumis à la politique et à la parité de mode (§6)                                  |
| `QWEN_CODE_MESSAGING_TOKEN` de l'environnement de la cible elle-même            | un processus démarré par cette session | livré selon la valeur par défaut de parité ; `origin="own-process"`                |
| Un jeton de contrôleur `qpc_<64 hex>` généré avec `qwen sessions controllers add` | un programme de confiance pour l'utilisateur | livré selon la valeur par défaut de parité ; `origin="controller"` avec le label de l'octroi |

Une première ligne qui n'est pas une ligne d'authentification, ou qui
présente un jeton ne correspondant à aucun des trois, coupe la connexion
silencieusement. Lorsque l'enregistrement n'a pas de `ipcToken`,
n'envoyez pas de ligne d'authentification ; une boîte de réception plus
ancienne la lit comme un type de frame inconnu et la saute, donc en
envoyer une est toujours sans danger.

Rien ici n'authentifie l'_expéditeur_ : un jeton prouve que la connexion
est autorisée, pas qui l'a ouverte. `from`, `fromName`, `fromMode` et
tous les champs de l'enregistrement sont des revendications.

C'est aussi l'intégralité du modèle de confiance. Un programme que
l'utilisateur veut voir piloter ses sessions reçoit un jeton de
contrôleur, généré à la main et donné à ce seul programme ; c'est ce qui
fait la différence entre un message qui est livré et un qui attend une
review. Écrire `kind: "external"` ou un `name` d'apparence familière ne
sert à rien.

## 4. La frame utilisateur

```json
{
  "msgV": 1,
  "msgId": "5f1d0c9e-3b2a-4e8f-9c7d-1a2b3c4d5e6f",
  "type": "user",
  "from": "/run/user/1000/qwen-socks/40011.sock",
  "replyToken": "<mon propre ipcToken>",
  "fromName": "project-3f",
  "fromMode": "prompting",
  "toSessionId": "8e016be8-…",
  "priority": "next",
  "message": { "role": "user", "content": "build terminé, 0 échec" }
}
```

| Champ         | Règle                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `msgV`        | Nombre. Doit être ≤ 1 ; supérieur est supprimé.                                                                                                                                                                               |
| `msgId`       | `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, et ne doit pas se canonicaliser (tirets supprimés, mis en minuscules) en `all`. Utilisez un UUID frais par message : le récepteur mémorise les identifiants qu'il a traités et répète l'ancien verdict pour un renvoi. |
| `type`        | `"user"`.                                                                                                                                                                                                                     |
| `from`        | Votre `ipcPath`, si vous en avez un. Où vont les accusés de réception. Absent signifie pas d'accusés de réception.                                                                                                            |
| `replyToken`  | Votre `ipcToken`, pour que le récepteur puisse authentifier ses accusés de réception envers vous.                                                                                                                             |
| `fromName`    | Nom d'affichage ; aplati sur une ligne, 200 caractères maximum.                                                                                                                                                               |
| `fromMode`    | `"prompting"` (une personne examine chaque action) ou `"bypass"` (certaines actions s'appliquent sans review). Absent signifie « n'affirme rien », ce qui est mis en attente pour review (§6).                                 |
| `toSessionId` | Le `sessionId` que vous avez lu dans l'enregistrement. Un récepteur détenant un identifiant différent répond `misaddressed`. Envoyez-le toujours.                                                                              |
| `priority`    | `"now"` ou `"next"` ; tout le reste est lu comme `"next"`. Conservé pour un futur chemin d'interruption ; aujourd'hui le récepteur met les deux en file pour le prochain tour.                                                 |
| `message`     | `role` doit être `"user"` ; `content` une chaîne non vide.                                                                                                                                                                    |

Les champs inconnus sont ignorés.

## 5. La frame de statut de livraison

Le récepteur rapporte le devenir d'un message avec une frame de contrôle
par résultat, envoyée au `from` du message et authentifiée avec son
`replyToken` :

```json
{
  "msgV": 1,
  "msgId": "<identifiant frais>",
  "type": "control",
  "action": "delivery_status",
  "status": "held",
  "origMsgId": "5f1d0c9e-…",
  "from": "/run/user/1000/qwen-socks/41337.sock",
  "reason": "Votre message est mis en attente pour que l'utilisateur destinataire l'examine …"
}
```

| `status`       | Quand                                                                                                                                                   | Que faire                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `held`         | Mis en attente pour review par l'utilisateur. Répété lors d'une nouvelle tentative, et lors d'une libération qui n'a pas pu être mise en file.           | Attendre ; une décision ou une expiration suit.                                     |
| `delivered`    | Mis en file pour le modèle.                                                                                                                             | Rien. Pas une preuve de lecture.                                                    |
| `denied`       | Une personne l'a examiné et a refusé.                                                                                                                   | Ne pas renvoyer.                                                                    |
| `refused`      | La politique de la session rejette les messages de pairs ; personne ne l'a vu. Toujours uniquement le premier accusé de réception.                        | Arrêter ; joindre cet utilisateur par un autre moyen.                               |
| `expired`      | Un message en attente a dépassé son délai d'attente, la session s'est terminée sans l'avoir lu, ou il est arrivé pendant l'arrêt de cette session. Peut suivre `held` ou `delivered`. | Renvoyer plus tard si c'est encore important.                                       |
| `misaddressed` | `toSessionId` ne correspond pas à la session à cette adresse.                                                                                           | Relire le registre.                                                                 |
| `dropped`      | La boîte de réception l'a rejeté avant l'application de toute politique (§6).                                                                           | Traiter comme non envoyé. Ne pas réessayer en boucle ; intégrer l'essentiel dans un message ultérieur. |

Un accusé de réception `dropped` transporte deux champs supplémentaires.
`dropReason` est `rate-limited`, `duplicate` ou `queue-full`.
`droppedMsgIds` liste jusqu'à 256 identifiants supplémentaires traités
par le même accusé : un burst reçoit un seul accusé plutôt qu'un par
message, ainsi un expéditeur fait passer chaque message perdu à un état
terminal depuis une seule frame. Les deux sont dénués de sens pour tout
autre statut et y sont ignorés.

`reason` est du texte libre destiné à un humain. L'ordre des accusés de
réception n'est pas garanti entre les connexions ; appliquez-les comme
des transitions d'état :

```
pending   → held | delivered | denied | refused | expired | misaddressed | dropped
held      → delivered | denied | expired | misaddressed
delivered → expired | misaddressed
```

Tout le reste est une répétition et doit être ignoré. Un accusé de
réception pour un identifiant que vous n'avez jamais envoyé est du
bruit ; ignorez-le. Les accusés de réception sont best-effort côté
récepteur : une limite d'envoi saturée ou un `from` mort les perd
silencieusement, donc un expéditeur doit tolérer de ne jamais recevoir
de réponse.

Votre propre boîte de réception reçoit ces frames des sessions auxquelles
vous avez envoyé des messages. Si vous ne faites qu'envoyer, liez quand
même une boîte de réception et fournissez `from` : sans cela, vous êtes
aveugle à tous les résultats ci-dessus.

## 6. Ce que le récepteur fait d'un message

Dans l'ordre :

1. **Admission.** Par expéditeur : un burst de 30, puis un message toutes
   les deux secondes. Tous les expéditeurs ensemble : un burst de 32,
   puis un par seconde — un expéditeur se nomme sur la frame, donc faire
   tourner ce nom offre un nouveau quota de la première limite mais pas
   de la seconde. Le même corps provenant d'une autre session dans les 30
   secondes est un `duplicate` ; un processus démarré par la session et
   un contrôleur fiable sont exemptés de cette vérification, et limités
   comme tout le monde pour le rate. Un message supprimé n'est jamais mis
   en attente, jamais livré, et ne laisse aucune trace, donc un
   expéditeur qui attend la fin de son burst et réessaie arrive quand
   même.
2. **Identifiants traités.** Un `msgId` que la gate a déjà décidé répète
   son verdict précédent.
3. **Politique.** `agents.crossSessionInbound` défini à `accept`, `hold`
   ou `refuse` gagne. Non défini : un processus démarré par la session ou
   un contrôleur fiable est accepté ; sinon un message n'est accepté que
   lorsque `fromMode` nomme la même classe de review que celle du
   récepteur, et mis en attente dans tous les autres cas, y compris
   lorsque `fromMode` est absent.
4. **Mise en attente.** Jusqu'à 50 messages attendent. Un message
   arrivant dans un buffer plein est `dropped` avec `queue-full` plutôt
   que d'évincer un message déjà en attente. Un message en attente
   expire après `agents.crossSessionHeldExpiry` (`1m`, `5m`, `10m`,
   `never` ; par défaut `5m`). L'utilisateur libère ou refuse depuis
   `/peers` ; un changement de mode réévalue le backlog.
5. **File d'attente.** Un message accepté rejoint la file d'entrée de la
   session, qui contient au maximum 50 messages de pairs. Une file pleine
   est aussi `dropped` avec `queue-full`.

Un expéditeur n'a pas à découvrir les limites à la dure : une session
Qwen Code les reflète par adresse et refuse son propre envoi avant de
l'écrire, en indiquant à son modèle de regrouper plutôt.

Le modèle voit un message livré comme :

```
<cross_session_message from="/run/user/1000/qwen-socks/40011.sock" name="project-3f">
build terminé, 0 échec
</cross_session_message>
```

suivi d'une notification indiquant l'autorité de l'expéditeur.
`origin="own-process"` ou `origin="controller" controller="<label>"` est
ajouté par le récepteur à partir de ce que la connexion a présenté,
jamais depuis la frame ; le label d'un contrôleur vient de l'octroi que
l'utilisateur a généré, pas de `fromName`. Les balises qui ressemblent à
l'enveloppe sont neutralisées dans `content`.

## 7. Compatibilité

- Un lecteur ignore les champs qu'il ne connaît pas. Ajouter un champ à
  un enregistrement ou une frame n'est pas un changement cassant.
- `schemaVersion` et `msgV` ne sont incrémentés que pour un changement de
  forme des champs existants. Un lecteur supprime une frame ou saute un
  enregistrement dont la version est supérieure à ce qu'il connaît, et ne
  supprime jamais un tel enregistrement.
- De nouvelles valeurs de `status` peuvent apparaître ; traitez une
  valeur inconnue comme « pas de transition » et continuez à attendre. Il
  en va de même pour un `kind` que vous ne reconnaissez pas : affichez-le,
  ne le corrigez pas.
- Constantes pouvant changer sans préavis : les chiffres de burst et de
  rate, le plafond de mise en attente et les choix d'expiration, la
  limite de ligne de 1 MiB, le délai de ligne de 30 secondes, le plafond
  de 64 connexions.

## 8. Pas encore fixé

- **Name yielding.** Deux sessions dans un même répertoire peuvent
  enregistrer le même `name` ; aujourd'hui elles ne sont distinguées que
  par `ref`. Un enregistrement qui s'efface devant un nom actif, et une
  frame de contrôle qui indique aux pairs qu'une session s'est renommée,
  sont tous deux à venir.
- **Rapport de noms identiques.** `qwen sessions ps` et `list_agents` ne
  signalent pas les enregistrements qui entrent encore en collision.
- **Messages entrants vers les sessions pilotées par ACP.** Une session
  qu'un programme pilote via ACP — lancée par le démon ou non —
  s'enregistre et peut envoyer, mais répond `refused` à tout ce qui lui
  est envoyé : une mise en attente est une question posée à une personne,
  et personne ne surveille une liste d'attente en son nom. L'endroit où
  un message en attente devrait apparaître pour ces sessions — son
  client, ou l'API propre du démon — reste ouvert.
- **Les sessions derrière une seule boîte de réception sont un seul
  expéditeur pour chaque pair.** Un processus hébergeant plusieurs
  sessions envoie avec une seule adresse `from`, donc le budget par
  expéditeur et la fenêtre de doublons (§6) du récepteur sont partagés
  par toutes les sessions de ce processus à la fois : un sibling occupé
  peut dépenser le quota d'un autre, et un corps juste envoyé à l'un ne
  peut pas être répété à son sibling dans la fenêtre. Une comptabilité
  par session devrait faire confiance à un champ affirmé par la frame, ce
  que le modèle de confiance de §3 exclut.

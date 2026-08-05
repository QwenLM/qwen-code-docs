# Métadonnées de source des sessions du démon

## Motivation

Les clients du démon doivent identifier quelle intégration a créé une session après le
redémarrage du démon. Les métadonnées live-only du bridge sont insuffisantes, car les entrées live
sont reconstruites depuis la transcription persistée au chargement ou à la reprise.

## API

`POST /session` accepte deux champs immuables optionnels :

- `sourceType` : un token de source en minuscules (`[a-z][a-z0-9_-]{0,63}`).
- `sourceId` : un identifiant non vide d'au plus 256 caractères. Il n'est valide
  que lorsque `sourceType` est présent.

Les champs sont renvoyés par la création de session, le statut et les réponses de liste
de sessions du workspace. Les sessions existantes omettent les deux champs. Sous `sessionScope: single`,
un attachement renvoie la source de la session existante et n'adopte jamais la source de la
requête d'attachement.

Les listes de sessions du workspace acceptent les paramètres de requête `sourceType` et `sourceId`
optionnel. `sourceId` exige `sourceType` ; lorsque les deux sont présents, ils sont
comparés conjointement. Les filtres de source ne sont pas combinés avec la vue organisée.

Les tâches planifiées du démon étiquettent leur session dédiée avec
`sourceType: "scheduled_task"` et l'id durable de la tâche comme `sourceId`.

Les workers de canal du démon étiquettent les sessions qu'ils créent avec `sourceType: "channel"`
et le nom configuré de l'instance de canal (par exemple `feishu-main`) comme `sourceId`,
afin que l'instance de canal — et, via la configuration du canal, le type de canal
(dingtalk/feishu/...) — soit attribuable sur le plan de données du démon. Charger ou
attacher une session existante ne ré-étiquette jamais sa source de création.

## Persistance

Une nouvelle session stocke un enregistrement système `session_source` près du début de sa
transcription JSONL :

```json
{
  "type": "system",
  "subtype": "session_source",
  "systemPayload": {
    "sourceType": "web_shell",
    "sourceId": "window-1"
  }
}
```

Le bridge demande à l'enfant de session d'ajouter cet enregistrement via une méthode de contrôle ACP
attendue, en accord avec la frontière de persistance existante de `parent_session`.
La réponse de création expose `sourcePersisted` afin qu'un appelant puisse détecter une source
live-only dégradée si l'enregistrement échoue.

`SessionService` lit l'enregistrement lors du scan du début de la transcription pour les réponses
de liste et avant le chargement/la reprise, afin que les résumés live restaurés conservent la source.

## Branchement

Les transcriptions bifurquées ne doivent pas copier `session_source` ; sinon une nouvelle branche
revendiquerait le créateur de la session d'origine. Une branche n'a pas de source tant que son chemin
de création n'en attribue pas une explicitement.

## Compatibilité

Les deux champs sont optionnels. Les anciennes transcriptions et les anciens clients restent valides. REST,
ACP-over-HTTP et le SDK TypeScript relaient la création et les champs de filtrage de liste.
Les démons qui implémentent les champs annoncent `session_source_metadata` ; le SDK
vérifie cette capacité avant d'envoyer les métadonnées de source ou les filtres de source, afin qu'un
démon plus ancien ne puisse pas les ignorer silencieusement et renvoyer des résultats non filtrés.
Les valeurs servent uniquement à l'attribution et ne doivent pas être utilisées comme signal
d'autorisation, car les clients peuvent les fournir.

Si un client se déconnecte avant de recevoir une session nouvellement créée, le démon
supprime à la fois la session live et sa transcription nouvellement écrite. Un attachement
concurrent empêche les deux opérations, préservant la session pour le client attaché.

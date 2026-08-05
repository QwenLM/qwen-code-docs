# La source de session dans les hooks de cycle de vie

## Contexte

La création de session du démon transmet déjà les valeurs optionnelles
`sourceType` et `sourceId` à l'ACP dans `_meta['qwen.session.source']`. Le
runtime ACP utilise actuellement le type de source pour désactiver le cron
natif des sessions de canal, mais les payloads des hooks de cycle de vie ne
peuvent observer aucune des deux valeurs. Les récepteurs ne peuvent donc pas
attribuer une nouvelle session lorsque `SessionStart` se déclenche avant que
le bridge ait persisté sa source.

## Design

Analyser une seule fois les métadonnées de source existantes à la frontière de
session ACP. Stocker les deux chaînes optionnelles dans la `Config` de la
session, à côté de l'id de session et des autres états à portée de session, et
exposer des getters en lecture seule.

Le gestionnaire d'événements de hook ajoute les valeurs de source présentes à
son entrée commune :

- `sourceType` devient `source_type`.
- `sourceId` devient `source_id`.

Des spreads d'objet conditionnels omettent les valeurs absentes au lieu de
sérialiser des champs vides ou indéfinis. Comme tous les événements de cycle
de vie utilisent le constructeur d'entrée commun, `SessionStart`,
`UserPromptSubmit`, `Stop` et `SessionEnd` reçoivent la même attribution
sans câblage spécifique à l'événement.

## Frontières

Il s'agit d'une lecture directe des métadonnées de création existantes. Cela
ne modifie ni la requête de création REST, ni la clé de métadonnées du bridge
ACP, ni la négociation de capacités, ni la persistance de session, ni le
comportement de reprise. Une session créée sans métadonnées de source conserve
la forme précédente du payload de hook.

## Vérification

- Les tests du gestionnaire de hook couvrent les champs de source présents et
  absents dans les payloads `SessionStart`.
- Les tests de session ACP couvrent la propagation des métadonnées de source
  de canal dans la `Config` de la session.
- Les tests existants du worker de canal continuent de couvrir les
  métadonnées de création, y compris le nom d'instance du canal comme
  `sourceId`.

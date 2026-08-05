# Identité de route des modèles ACP

## Problème

Qwen Code expose actuellement les ID de modèles ACP sous la forme `modelId(authType)`. Deux modèles configurés avec le même ID de modèle et le même type d'authentification mais des valeurs `baseUrl` différentes sont donc regroupés en un seul sélecteur ACP. Les clients ne peuvent pas identifier la ligne active ni renvoyer une sélection vers l'endpoint prévu.

Core traite déjà `(authType, modelId, baseUrl configuré)` comme l'identité du registre. La perte ne se produit que lorsque cette identité traverse la frontière ACP. La valeur configurée doit rester distincte de l'endpoint résolu, car les valeurs par défaut du fournisseur peuvent remplir `baseUrl` après l'enregistrement.

## Conception

Construire les options de modèles ACP à partir de la liste existante des modèles configurés :

- Conserver `modelId(authType)` lorsqu'il est unique. Cela préserve les ID existants pour le cas normal.
- Lorsque plusieurs options partageraient cet ID, remplacer chacune par un sélecteur déterministe `qwen-route:v1:<digest>` dérivé des métadonnées non secrètes du modèle et de l'identité publique de l'endpoint (identifiants, query et fragment retirés).
- Rejeter les routes qui restent indiscernables après assainissement au lieu d'utiliser l'ordre du tableau, qui pourrait remapper un ancien sélecteur après un réordonnancement de la configuration.
- Continuer d'utiliser `ModelInfo.name` et les métadonnées du fournisseur pour l'affichage. L'ID de route est un sélecteur machine opaque.

Core expose le `baseUrl` optionnel d'origine du registre à côté de l'endpoint d'affichage résolu. Le même constructeur d'options fournit les modèles de session ACP, les options de configuration, le statut live du fournisseur et le statut du fournisseur du workspace du démon, afin que chaque client voie le même ID tandis que le serveur conserve le discriminant exact du registre.

Lors de `session/set_model`, Qwen Code résout le sélecteur par rapport à la liste actuelle des modèles configurés avant de basculer. Il transmet le `baseUrl` résolu à Core, puis ne persiste que les valeurs canoniques des paramètres :

- `model.name` : l'ID réel du modèle
- `model.baseUrl` : l'endpoint configuré du registre, ou une pierre tombale vide pour une valeur par défaut implicite
- `security.auth.selectedType` : le type d'authentification réel

Le sélecteur opaque n'est jamais écrit dans `settings.json`.

## Compatibilité

- Le schéma ACP est inchangé ; `modelId` reste une chaîne.
- Les ID de modèles existants uniques conservent la représentation actuelle sur le fil.
- Les requêtes legacy `modelId(authType)` restent acceptées. Si un tel ID est ambigu, le comportement existant de première correspondance est préservé pour la compatibilité ; les sélecteurs nouvellement annoncés sont exacts.
- Les sélecteurs opaques inconnus ou obsolètes sont rejetés au lieu d'être traités comme des ID de modèles littéraux.
- Les clients ACP génériques, y compris Zed, ont seulement besoin de renvoyer le sélecteur opaque.
- Le comportement des paramètres et de la sélection du TUI CLI est inchangé.

## Vérification

- Les routes en double reçoivent des sélecteurs distincts et stables sans divulguer leurs URL.
- L'état du modèle de session et les options de configuration publient les mêmes sélecteurs et la route actuelle exacte.
- Sélectionner la seconde route bascule avec son `baseUrl`, persiste les paramètres canoniques et notifie les clients avec son sélecteur opaque.
- Le statut du fournisseur du démon identifie la route actuelle exacte pour le Web Shell.
- Les sélections de modèles uniques et legacy continuent de fonctionner.

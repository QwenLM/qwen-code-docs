# Déploiement de référence pour les agents managés


La distribution de référence Managed Agent est expérimentale. Sa topologie initiale acceptée comprend un plan de contrôle Java et son Runtime Broker intégré sur un hôte Linux de confiance, une base de données MySQL, et un Qwen Hosted Harness compatible. Le manifeste de compatibilité de chaque version fait autorité pour cette version.

## Vérifier et extraire

Téléchargez l'archive, son manifeste détaché, et `SHA256SUMS.txt` depuis la même prerelease GitHub. Vérifiez-les avant extraction :

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

Inspectez `manifest.json`. Confirmez que `source.revision` correspond à la révision vérifiée, que `compatibility.qwenCodeVersion` correspond à l'installation CLI/Harness, et que `compatibility.databaseSchema.latestMigrationVersion` est acceptable pour la base de données cible. La version est invalide si une vérification de somme de contrôle ou de compatibilité échoue.

## Prérequis

- Linux sur l'hôte d'application de confiance.
- JDK 21 ou ultérieur.
- Node.js correspondant à `compatibility.node` et Qwen Code correspondant à `compatibility.qwenCodeVersion`.
- MySQL 8 avec une base de données vide ou une base de données précédemment gérée par une distribution de référence compatible plus ancienne.
- Des répertoires privés et persistants pour l'état du Runtime et le Workspace autorisé.
- Des identifiants de base de données stables, une clé d'identification du Runtime, et un token Harness stockés en dehors de l'archive.

L'archive Java ne contient pas le CLI npm. Installez ou construisez séparément la révision exacte compatible de Qwen Code et localisez son `dist/cli.js` pour les workers du Runtime.

## Démarrer le Hosted Harness

Choisissez un token et un digest de capacité, et fournissez les mêmes valeurs au Harness et au service Java :

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Maintenez le Harness en loopback. Notez le port qu'il indique ; `--port` peut avancer si le port demandé est déjà occupé.

## Démarrer le plan de contrôle Java

Dans un autre terminal, configurez le même Harness et la base de données :

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

Le launcher utilise le JAR serveur de cette archive. Spring Flyway applique les migrations de base de données vers l'avant avant que le service ne soit prêt. Attendez :

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

Cette configuration de base prend en charge les Hosted Sessions en texte uniquement. Maintenez l'écouteur en loopback sauf si une entrée signée ou authentifiée est configurée. La configuration complète d'authentification, d'API et de capacité est regroupée dans `docs/server-reference.md`.

## Activer le chemin d'outils local-process accepté

L'exécution des outils nécessite la configuration existante du Runtime et du Workspace en mode fail closed. Au minimum, configurez :

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Avant d'admettre du travail fichier, Shell, ou Git enfant, complétez l'enregistrement du stockage natif et la vérification d'identité de montage décrite sous « Verified physical Workspace recovery » dans `docs/server-reference.md`. Un montage non enregistré ou ambigu doit rester indisponible. La publicité des capacités Shell publiques et v2 reste désactivée jusqu'à ce que leur qualification séparée soit terminée.

## Mise à niveau

1. Téléchargez et vérifiez la nouvelle archive et lisez les deux manifestes. Confirmez les nouvelles exigences Qwen Code/Harness, Java, protocole et base de données avant de toucher au déploiement en cours.
2. Arrêtez les nouvelles entrées. Attendez que le travail admis se termine selon la procédure de vidange existante du déploiement.
3. Sauvegardez MySQL, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`, la clé d'identification du Runtime, et la distribution ancienne exacte. Ne faites pas tourner la clé d'identification pendant la mise à niveau.
4. Arrêtez le service Java et le Hosted Harness. Préservez le Workspace et l'état durable du Runtime.
5. Installez le Qwen Code/Harness compatible avec le manifeste et démarrez-le avec le token et le digest de capacité existants.
6. Démarrez le nouveau `bin/qwen-managed-agent-server` avec les mêmes paramètres de base de données et durables. Flyway migre le schéma vers l'avant.
7. Exigez une réponse saine de l'actuator, lisez une Session et un historique existants, puis complétez un nouveau tour sans outil avant de rouvrir l'entrée. Requalifiez toute capacité d'outil optionnelle avant de l'activer.

La rétrogradation de la base de données n'est pas prise en charge. Si le démarrage ou la validation échoue avant la reprise du trafic, corrigez la configuration et réessayez avec le même artefact. Pour revenir à une version dont le manifeste a une plage de schéma plus ancienne, restaurez la sauvegarde de la base de données et de l'état du Runtime d'avant la mise à niveau ensemble avant d'accepter toute nouvelle écriture ; ne lancez jamais un ancien serveur contre une base de données migrée par supposition.

## Rotation de la clé d'identification du Runtime

Faites tourner la clé d'identification séparément d'une mise à niveau de la distribution. Sauvegardez la base de données et les clés actuelles, puis configurez la nouvelle paire active et conservez l'ancienne paire sous `previous-credential-keys` :

```yaml
qwen:
  managed-agent:
    runtime-broker:
      credential-key-id: reference-v2
      credential-key: <base64-encoded-32-byte-v2-key>
      previous-credential-keys:
        '[reference-v1]': <base64-encoded-32-byte-v1-key>
```

Entourez chaque clé de map de `[ ... ]`. Le binder relâché de Spring normalise les clés simples — un ID tel que `legacy/v1`, `legacy:v1` ou `legacy v1` se lie sous la forme `legacyv1`, qu'il soit entre guillemets dans le YAML ou non — le ring ne correspond alors jamais à l'ID de clé persisté et les lignes écrites sous cet ID restent illisibles même si la clé est configurée. La forme entre crochets préserve l'ID exact.

Redémarrez le plan de contrôle Java unique, vérifiez que les bindings existants se chargent, et vérifiez que les nouvelles lignes de binding enregistrent `reference-v2`. Les nouveaux secrets utilisent uniquement la clé active ; les anciennes lignes restent chiffrées sous leur ID de clé enregistré. Le serveur ne rechiffre pas les anciennes lignes à la lecture, et supprimer une clé encore référencée rend ces lignes illisibles.

Retirez `reference-v1` uniquement lorsqu'aucune ligne persistée ne le référence. `ma_runtime_binding.credential_key_id` et `ma_runtime_binding.runtime_credential_key_id` sont les seules références persistées ; les deux stockent des octets UTF-8. Sélectionnez-les sans `CONVERT` afin que la déduplication reste exacte au niveau des octets, tout comme la sélection de clé : une valeur convertie porte la collation par défaut du jeu de caractères et fusionnerait deux ID qui ne diffèrent que par la casse ou l'accent, masquant une clé que des lignes référencent encore.

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL;
```

Le résultat liste les ID de clé que les lignes persistées nécessitent encore : attendez-vous uniquement à l'ID actif (`reference-v2`). Tant que `reference-v1` apparaît, cette clé doit rester configurée.

Le key ring est une map et ne peut pas être fourni via une variable d'environnement `QWEN_MANAGED_AGENT_*` : le binding relâché résout silencieusement une forme env-var en un ring vide ou mal clé, sans erreur de démarrage. Configurez `previous-credential-keys` dans un `application.yml` que le processus serveur charge effectivement. La distribution de référence ne fournit aucun fichier de configuration, et Spring résout un `application.yml` externe par rapport au répertoire de travail du processus (`./` et `./config/`), et non par rapport à la racine de la distribution ; `bin/qwen-managed-agent-server` transmet ses arguments à la JVM, donc `--spring.config.additional-location=file:<absolute-path>` fixe l'emplacement. Un déploiement qui repose uniquement sur des variables d'environnement démarre avec un ring vide, donc faire tourner `credential-key-id` sans configuration de la clé précédente rend les lignes écrites sous celle-ci illisibles.

Le point d'entrée de récupération opérateur lit la même paire active et la même map `previous-credential-keys` que le serveur. Chargez le même YAML externe pour la récupération, par exemple avec `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<absolute-path>/application.yml`, et gardez la nouvelle clé active tout en conservant chaque clé encore référencée par un binding. Les mains de maintenance CSI/migration, y compris la sonde CSI Hosted, lisent toujours une seule paire de clés d'identification ; lancez ces points d'entrée avec la clé qui a chiffré leur binding cible comme paire active.

## Récupération opérateur

`bin/qwen-managed-agent-operator-recovery` démarre le point d'entrée de récupération empaqueté séparément. Il est désactivé sauf si l'environnement spécifique à la récupération est défini et ne démarre pas le service HTTP ni le worker. Suivez `docs/hosted-workspace-recovery.md` ; ne déduisez jamais un arrêt physique ni ne supprimez de lignes durables pour contourner une barrière de sécurité.

## Périmètre

Cette distribution ne certifie pas plusieurs plans de contrôle Java, le takeover cross-host, le CSI public, le retirement Kubernetes, le Shell public, la publicité v2, ni le support production stable. Ces capacités nécessitent des preuves de version séparées.
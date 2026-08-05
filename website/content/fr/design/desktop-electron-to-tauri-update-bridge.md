# Bridge de mise à jour bureau Electron vers Tauri

## Contexte

La dernière release bureau publiée, `desktop-v0.0.5`, est une application
Electron nommée `Qwen Code Desktop` avec l'identifiant de bundle
`com.alibaba.qwen-code`. Son updater macOS lit `latest-mac.yml` depuis la
release fixe `desktop-latest` et installe une archive ZIP.

Le nouveau shell bureau est une application Tauri. Elle utilise
actuellement un nom de produit et un identifiant de bundle différents et
publie `desktop-latest.json`, de sorte que l'application Electron existante
ne peut ni la découvrir ni la remplacer.

## Objectifs

- Permettre aux installations macOS signées d'Electron `0.0.5` de passer
  directement à la première release stable de Tauri.
- Préserver l'identité d'application macOS existante afin que l'updater
  remplace le bundle d'application installé.
- Conserver le flux d'updater signé de Tauri pour toutes les releases après
  la migration.
- Rendre le bridge opt-in et à usage unique ; les releases ultérieures ne
  doivent pas avoir besoin de l'outillage de build Electron.

## Non-objectifs

- Migrer les paramètres, les sessions ou l'état du workspace d'Electron.
  L'application Tauri peut demander un workspace au premier lancement.
- Créer un bridge pour les installations Electron Windows ou Linux.
- Générer des blockmaps différentiels Electron. L'updater Electron retombe
  sur le ZIP complet vérifié par checksum.

## Contrat de compatibilité

Le bundle Tauri utilise l'identité macOS legacy :

- nom de produit : `Qwen Code Desktop`
- identifiant de bundle : `com.alibaba.qwen-code`
- préfixe d'artefact : `Qwen-Code-Desktop`
- identité de signature : le certificat Developer ID Application existant

La release de bridge doit être plus récente que `0.0.5`. Elle publie deux
vues d'updater sur les mêmes bundles d'application signés :

1. `latest-mac.yml` dirige les clients Electron legacy vers
   `Qwen-Code-Desktop-arm64.zip` ou `Qwen-Code-Desktop-x64.zip`.
2. `desktop-latest.json` dirige les clients Tauri vers les archives
   d'updater Tauri signées.

Le ZIP est créé à partir du `.app` déjà signé et notarié ; il n'est pas
reconstruit par l'outillage Electron.

## Flux de release

`Desktop Release` gagne une entrée `electron_bridge`, désactivée par
défaut.

- Tous les builds macOS continuent de produire l'application Tauri, le DMG,
  l'archive d'updater et la signature d'updater.
- Lorsque `electron_bridge` est activé, chaque build macOS crée aussi un ZIP
  compatible legacy.
- La tâche de publication génère `latest-mac.yml` à partir des deux ZIP et
  des deux DMG.
- Une release de bridge stable téléverse les métadonnées et payloads legacy
  vers `desktop-latest` avec `desktop-latest.json`.
- Les releases stables ultérieures laissent `electron_bridge` désactivé.
  Mettre à jour `desktop-latest.json` ne supprime pas les fichiers de
  bridge, de sorte que les installations Electron qui reviennent plus tard
  peuvent toujours passer à Tauri.

Les exécutions draft et prerelease peuvent construire et publier des
artefacts de bridge pour inspection, mais elles ne mettent jamais à jour le
flux stable.

## Identifiants de signature

Le dépôt stocke déjà le certificat Apple de l'ère Electron et la clé API App
Store Connect sous les noms de secrets `MAC_CSC_*` et `APPLE_NOTARY_*`. Le
workflow accepte ces noms comme fallbacks pour les noms Tauri plus récents,
de sorte que l'identité Developer ID reste inchangée.

Les artefacts d'updater Tauri nécessitent en outre
`TAURI_SIGNING_PRIVATE_KEY` ; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` n'est
nécessaire que pour une clé privée chiffrée. La clé privée doit
correspondre à la clé publique de la configuration Tauri avant la première
release Tauri publiée.

## Validation

Les tests automatisés du release-helper vérifient :

- l'identité d'application legacy,
- la sélection exacte des artefacts de bridge,
- les valeurs SHA-512 et de taille dans `latest-mac.yml`,
- l'échec lorsqu'un artefact de bridge requis est manquant,
- le comportement existant du manifeste d'updater Tauri et de la
  synchronisation des versions.

Avant la release stable, installez les builds arm64 et x64 signés de
`desktop-v0.0.5`, pointez-les vers un flux de bridge isolé et vérifiez les
mises à jour `0.0.5 -> bridge Tauri` et `bridge Tauri -> Tauri plus
récent`.

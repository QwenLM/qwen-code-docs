# Addon natif de clipboard standalone

## Problème

Le bundle CLI conserve `@teddyzhu/clipboard` en externe afin que les
installations npm puissent charger le package natif spécifique à la
plateforme à l'exécution. Les archives standalone conservent également
l'import en externe, mais ne copient actuellement que l'addon natif de
capture audio dans `lib/node_modules`. Le collage d'image depuis le
clipboard échoue donc silencieusement dans toutes les archives standalone.

## Contraintes

- Chaque archive doit contenir le package JavaScript `@teddyzhu/clipboard`
  et exactement un package natif correspondant à la cible de l'archive.
- Le job de release crée toutes les cibles prises en charge sur un seul
  runner Ubuntu. Un `npm ci` normal n'installe que le package natif
  optionnel du runner, donc le packaging ne peut pas compter sur le
  `node_modules` du dépôt pour les artefacts multi-cibles.
- Les versions des packages de clipboard doivent provenir du lockfile et
  rester alignées avec les dépendances optionnelles du CLI.
- Le packaging local doit continuer à fonctionner lorsqu'un artefact de
  clipboard non hôte n'est pas disponible, tandis que le packaging de
  release doit échouer plutôt que de publier une archive partiellement
  fonctionnelle.

## Design

Avant de construire les archives de release, installer le méta-package de
clipboard verrouillé et tous les packages cibles pris en charge dans un
répertoire de staging temporaire. Passer ce répertoire explicitement à la
commande de packaging par cible.

Le packager standalone mappe chaque cible à son package natif de clipboard
et copie uniquement le méta-package plus ce package cible dans
`lib/node_modules/@teddyzhu`. Lorsqu'aucun répertoire de staging explicite
n'est fourni, le packager utilise le `node_modules` du dépôt ; un artefact
hôte manquant émet un avertissement pour les builds locales. Des artefacts
manquants dans un répertoire de staging explicite sont fatals.

Si le module runtime ne peut toujours pas se charger, le prompt de saisie
signale une seule erreur visible par l'utilisateur lors de la première
tentative de collage d'image depuis le clipboard. Les chemins Linux
existants `wl-paste` et `xclip` sont inchangés.

## Vérification

- Les tests de packaging couvrent la sélection de cible, l'exclusion des
  autres cibles natives et l'échec pour un staging explicite incomplet.
- Les tests de clipboard et de prompt de saisie couvrent le callback de
  module indisponible et l'erreur UI à usage unique.
- Une véritable archive macOS arm64 est décompressée hors du dépôt, chargée
  avec son runtime Node.js embarqué, et exercée contre un PNG réel dans le
  clipboard système.

![Collage de clipboard standalone avant et après](./standalone-clipboard-native-addon/assets/before-after.png)

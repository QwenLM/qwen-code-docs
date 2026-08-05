# Mises à jour npm en arrière-plan

## Problème

La CLI publiée est découpée en chunks JavaScript à hash de contenu. Exécuter
`npm install -g` depuis une session active remplace ces chunks sur place, de
sorte qu'un import dynamique ultérieur dans l'ancien processus peut échouer
avec `ERR_MODULE_NOT_FOUND`. Différer l'installation jusqu'à la sortie de la
session évite la corruption, mais transforme une mise à jour en arrière-plan
en délai à la sortie et n'apporte aucun bénéfice aux utilisateurs tant qu'ils
ne quittent pas la session.

## Design

Pour les installations npm globales inscriptibles, la vérification de mise à
jour après le rendu installe la version résolue exacte sous un répertoire
dérivé du lanceur global :

```text
~/.qwen/updates/npm/<launcher-id>/versions/<version>/
```

La vérification de version exécute npm dans son contexte global et
l'installation préparée utilise un préfixe isolé. La commande préparée
préserve explicitement la configuration npm globale d'origine, afin que le
changement de préfixe ne bascule ni de registre ni d'authentification entre
la découverte et l'installation.

Le lanceur résout `QWEN_HOME` depuis les mêmes fichiers `.env` à portée
home avant de sélectionner une version. Cela garde le chemin d'amorçage
aligné avec le stockage de la CLI même si le chargeur d'environnement complet
s'exécute plus tard.

L'installation et l'activation s'exécutent dans un worker détaché, de sorte
que quitter la TUI n'interrompt pas une mise à jour déjà en cours. Après que
npm est sorti avec succès, le worker vérifie le nom du paquet, la version, le
bundle et le lanceur, puis écrit de manière atomique un pointeur
`active.json` à côté des versions de ce lanceur. Le paquet npm global n'est
pas modifié. Le processus déjà en cours d'exécution et les commandes enfants
qu'il démarre restent épinglés à leur build d'origine. À la prochaine
invocation, le lanceur stable lit le pointeur et démarre le répertoire de
version vérifié.

Chaque lanceur npm global a son propre pointeur et ses propres payloads de
version, de sorte que les installations sous différents préfixes npm ou nvm
peuvent partager `~/.qwen` sans se surcharger mutuellement ni partager de
dépendances. Une mise à jour concurrente plus lente ne peut pas remplacer une
version active plus récente.

Une installation incomplète ne change jamais le pointeur actif. Avant
l'activation, le worker valide le manifeste installé et exécute un smoke test
du lanceur. Un pointeur manquant, mal formé ou ne correspondant pas au
lanceur est ignoré et le paquet npm d'origine reste le fallback. Le pointeur
enregistre aussi l'identité du paquet de base et du lanceur, de sorte qu'une
installation npm globale explicite ultérieure supplante la version managée.
Comme le lanceur n'est pas remplacé par les mises à jour managées, les champs
`active.json` existants constituent un contrat de compatibilité : les
changements futurs peuvent ajouter des champs mais ne doivent ni en supprimer
ni en réinterpréter.

Les répertoires de version sont conservés car une ancienne session encore en
vie peut encore charger depuis eux. Le nettoyage est volontairement différé
jusqu'à ce que l'usage disque montre qu'un collecteur basé sur des baux est
nécessaire.

## Périmètre

Cela ne change les mises à jour automatiques que pour les installations npm.
Les autres gestionnaires de paquets et les archives autonomes conservent le
comportement existant sûr à la sortie jusqu'à ce qu'ils disposent d'une
disposition d'installation équivalente à versions immuables.

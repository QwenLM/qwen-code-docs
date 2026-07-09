# Plan global du Hot Reload

Ce répertoire suit le travail de conception pour l'issue
[#3696](https://github.com/QwenLM/qwen-code/issues/3696) : un système de hot-reload complet
pour les skills, les extensions, les serveurs MCP, les serveurs LSP et la configuration
runtime.

## Objectif

Les utilisateurs doivent pouvoir mettre à jour les skills, l'état des extensions, la configuration MCP/LSP
et les paramètres pris en charge sans redémarrer la session Qwen Code en cours. Le
système doit préserver le contexte de la conversation tout en rendant les changements d'état
runtime prévisibles et visibles.

## Décomposition des sous-tâches

Le plan de hot-reload comprend **6 sous-tâches de premier niveau**. L'issue de suivi
actuelle divise la sous-tâche 3 en **3a** et **3b** pour plus de clarté dans l'implémentation,
la liste de contrôle d'exécution contient donc **7 entrées**.

| Tâche | Périmètre                                    | Statut                   | Document de conception                                                      |
| ---- | ---------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 1    | Détection des changements du fichier de paramètres           | Terminé dans #4933            | [settings-change-detection.md](./settings-change-detection.md)       |
| 2    | Améliorations du hot-reload des skills            | Terminé via #2415 et #3923 | Non présent dans ce répertoire                                                |
| 3a   | Réinitialisation runtime des serveurs MCP     | En cours via #5561    | [mcp-runtime-reinitialization.md](./mcp-runtime-reinitialization.md) |
| 3b   | Réinitialisation runtime des serveurs LSP     | En cours              | [lsp-runtime-reinitialization.md](./lsp-runtime-reinitialization.md) |
| 4    | Orchestration unifiée du rafraîchissement/cache      | Non démarré              | En attente                                                              |
| 5    | Commande slash `/reload` pour l'utilisateur      | Non démarré              | En attente                                                              |
| 6    | Notification d'état d'application/UI `needsRefresh` | Non démarré              | En attente                                                              |

## Correspondance des documents

- `settings-change-detection.md` correspond à la **sous-tâche 1 : Détection des changements du fichier de
  paramètres**. Il fournit l'infrastructure de surveillance : détecter les changements pris en charge
  dans `settings.json`, recharger les paramètres depuis le disque et notifier les listeners. Il
  ne pousse intentionnellement pas les valeurs mises à jour dans les snapshots de `Config` et ne redémarre pas
  les sous-systèmes runtime.
- `mcp-runtime-reinitialization.md` correspond à la **sous-tâche 3a : Réinitialisation runtime des serveurs
  MCP**. Il consomme les événements de changement de paramètres, met à jour la
  configuration MCP runtime et réconcilie de manière incrémentale les connexions MCP actives.
  L'issue originale regroupait MCP et LSP sous la sous-tâche de premier niveau 3 ; ce
  document ne couvre que la partie MCP.
- `lsp-runtime-reinitialization.md` correspond à la **sous-tâche 3b : Réinitialisation runtime des serveurs
  LSP**. Il surveille les changements du fichier `.lsp.json` de l'espace de travail,
  réutilise le client LSP natif existant et réconcilie de manière incrémentale les serveurs LSP
  actifs.

## Ordre d'implémentation

1. Conserver la sous-tâche 1 comme fondation : les changements de paramètres sont détectés et
   distribués, mais ce sont les consommateurs qui décident de ce qu'il faut rafraîchir.
2. Terminer la sous-tâche 3a afin que les ajouts, suppressions et modifications de configuration
   des serveurs MCP puissent prendre effet au runtime.
3. Ajouter la sous-tâche 3b pour la réinitialisation runtime des LSP en utilisant le même principe :
   mettre à jour la configuration runtime, arrêter les serveurs affectés et redémarrer uniquement ce qui
   a changé.
4. Introduire la sous-tâche 4 comme couche d'orchestration partagée pour les rafraîchissements du cache et du
   runtime à travers les skills, les commandes, les prompts, les extensions, MCP et LSP.
5. Ajouter la sous-tâche 5 comme point d'entrée manuel pour l'utilisateur : `/reload` doit appeler le
   chemin d'orchestration unifié et rapporter ce qui a changé.
6. Ajouter la sous-tâche 6 pour l'UX des changements en arrière-plan : définir `needsRefresh` lorsqu'un changement
   détecté ne peut pas ou ne doit pas être appliqué automatiquement et entièrement, puis inviter l'utilisateur
   à exécuter `/reload`.

## Principe de conception

Maintenir un périmètre restreint pour chaque couche :

- la surveillance des fichiers détecte et signale les changements de paramètres ;
- la réinitialisation des sous-systèmes met à jour uniquement l'état runtime affecté ;
- l'orchestration unifiée séquence les opérations de rafraîchissement existantes ;
- les commandes et notifications de l'UI exposent le comportement sans dupliquer la logique de
  rechargement.
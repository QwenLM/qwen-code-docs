# Plan d'implémentation de l'affichage des outils Agent

> **Pour Claude :** SOUS-COMPÉTENCE REQUISE : Utiliser `superpowers:executing-plans` pour implémenter ce plan tâche par tâche.

**Objectif :** Ajouter un affichage dédié dans l'interface VSCode/web pour les exécutions d'outils Agent, afin que la progression, les résumés et les échecs des sous-agents soient rendus à partir du `rawOutput` structuré au lieu de retomber sur la carte d'outil générique.

**Architecture :** Préserver le `rawOutput` ACP à travers le pipeline de session/mise à jour VSCode vers `ToolCallData`, puis laisser le routeur partagé de l'interface web détecter les payloads `task_execution` et rendre un composant dédié `AgentToolCall`. Conserver la modification partagée dans `packages/webui` pour que VSCode et `ChatViewer` restent synchronisés.

**Stack technique :** TypeScript, React, Vitest, composants partagés d'appels d'outils `@qwen-code/webui`.

### Tâche 1 : Verrouiller le comportement défaillant du flux de données

**Fichiers :**

- Modifier : `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Créer : `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Étape 1 : Rédiger les tests en échec**

- Ajouter un test au gestionnaire de session vérifiant que `tool_call_update` transmet `rawOutput` lorsque l'ACP envoie un payload `task_execution`.
- Ajouter un test au hook vérifiant que `useToolCalls` stocke et met à jour `rawOutput` pour un appel d'outil agent.

**Étape 2 : Exécuter le test pour vérifier l'échec**

Exécuter : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Résultat attendu : échecs car `rawOutput` n'est pas préservé dans le pipeline actuel du gestionnaire/hook.

### Tâche 2 : Verrouiller le comportement défaillant du moteur de rendu

**Fichiers :**

- Créer : `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Étape 1 : Rédiger le test en échec**

- Rendre l'appel d'outil routé avec `kind: 'other'` et `rawOutput.type === 'task_execution'`.
- Vérifier que la description de la tâche, l'outil enfant actif, le résumé et la raison de l'échec sont rendus via un affichage agent dédié au lieu d'une sortie texte générique.

**Étape 2 : Exécuter le test pour vérifier l'échec**

Exécuter : `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Résultat attendu : échec car le routeur ne se base que sur `kind` et aucun composant agent dédié n'existe.

### Tâche 3 : Préserver la sortie agent structurée de bout en bout

**Fichiers :**

- Modifier : `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Modifier : `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Modifier : `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Modifier : `packages/webui/src/components/toolcalls/shared/types.ts`

**Étape 1 : Implémenter les modifications minimales du modèle de données**

- Ajouter `rawOutput` optionnel aux types d'appels d'outils de la session/webview VSCode.
- Transmettre `rawOutput` dans `QwenSessionUpdateHandler`.
- Stocker/merger `rawOutput` dans `useToolCalls`.
- Exposer `rawOutput` dans les types de données d'appels d'outils partagés de l'interface web.

**Étape 2 : Exécuter les tests ciblés**

Exécuter : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Résultat attendu : succès.

### Tâche 4 : Ajouter l'interface partagée pour les appels d'outils Agent

**Fichiers :**

- Créer : `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Modifier : `packages/webui/src/components/toolcalls/index.ts`
- Modifier : `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Modifier : `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Étape 1 : Implémenter le moteur de rendu minimal**

- Ajouter une condition de garde pour `rawOutput.type === 'task_execution'`.
- Rendre la description de la tâche comme en-tête.
- Afficher le nom + le statut de l'agent, les outils enfants en cours d'exécution, le résumé de fin d'exécution et la raison de l'échec ou de l'annulation.
- Conserver une mise en page compatible avec plusieurs cartes agent parallèles en rendant chaque appel d'outil de manière indépendante.

**Étape 2 : Exécuter le test ciblé du moteur de rendu**

Exécuter : `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Résultat attendu : succès.

### Tâche 5 : Vérifier la surface intégrée

**Fichiers :**

- Modifier : `packages/webui/src/index.ts`

**Étape 1 : Exporter le nouveau composant partagé si nécessaire**

- Réexporter tout nouveau composant/type requis par VSCode ou `ChatViewer`.

**Étape 2 : Exécuter la vérification du package**

Exécuter : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Exécuter : `npm run check-types --workspace=packages/vscode-ide-companion`
Exécuter : `npm run typecheck --workspace=packages/webui`

Résultat attendu : tous les tests ciblés et vérifications de type réussissent.
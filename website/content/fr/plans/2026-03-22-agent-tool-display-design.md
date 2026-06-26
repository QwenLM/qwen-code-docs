# Plan d'implémentation de l'affichage des outils d'agent

> **Pour Claude :** COMPÉTENCE REQUISE : utilisez superpowers:executing-plans pour implémenter ce plan tâche par tâche.

**Objectif :** Ajouter un affichage dédié dans VSCode/l'interface web pour les exécutions d'outils d'agent, afin que les progressions, résumés et échecs des sous-agents soient rendus à partir du `rawOutput` structuré au lieu de recourir à la carte d'outil générique.

**Architecture :** Conserver le `rawOutput` de l'ACP tout au long du pipeline de session/mise à jour VSCode jusqu'à `ToolCallData`, puis laisser le routeur d'interface web partagé détecter les payloads `task_execution` et afficher un composant `AgentToolCall` dédié. Maintenir la modification partagée dans `packages/webui` afin que VSCode et `ChatViewer` restent alignés.

**Stack technique :** TypeScript, React, Vitest, composants d'appels d'outils partagés `@qwen-code/webui`.

### Tâche 1 : Verrouiller le comportement défaillant du flux de données

**Fichiers :**

- Modifier : `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Créer : `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Étape 1 : Écrire les tests en échec**

- Ajouter un test du gestionnaire de session qui vérifie que `tool_call_update` transmet `rawOutput` lorsque l'ACP envoie un payload `task_execution`.
- Ajouter un test du hook qui vérifie que `useToolCalls` stocke et met à jour `rawOutput` pour un appel d'outil d'agent.

**Étape 2 : Exécuter le test pour confirmer l'échec**

Exécutez : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Résultat attendu : échecs car `rawOutput` n'est pas conservé dans le pipeline gestionnaire/hook actuel.

### Tâche 2 : Verrouiller le comportement défaillant du rendu

**Fichiers :**

- Créer : `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Étape 1 : Écrire le test en échec**

- Rendre l'appel d'outil routé avec `kind: 'other'` et `rawOutput.type === 'task_execution'`.
- Vérifier que la description de la tâche, l'outil enfant actif, le résumé et la raison de l'échec sont affichés via un affichage d'agent dédié, et non via une sortie textuelle générique.

**Étape 2 : Exécuter le test pour confirmer l'échec**

Exécutez : `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Résultat attendu : échec car le routeur ne s'appuie que sur `kind` et qu'aucun composant d'agent dédié n'existe.

### Tâche 3 : Conserver la sortie structurée de l'agent de bout en bout

**Fichiers :**

- Modifier : `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Modifier : `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Modifier : `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Modifier : `packages/webui/src/components/toolcalls/shared/types.ts`

**Étape 1 : Implémenter les modifications minimales du modèle de données**

- Ajouter `rawOutput` optionnel aux types d'appels d'outils de session/webview VSCode.
- Transmettre `rawOutput` dans `QwenSessionUpdateHandler`.
- Stocker/fusionner `rawOutput` dans `useToolCalls`.
- Exposer `rawOutput` dans les types de données d'appels d'outils de l'interface web partagée.

**Étape 2 : Exécuter les tests ciblés**

Exécutez : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Résultat attendu : succès.

### Tâche 4 : Ajouter l'interface utilisateur partagée de l'appel d'outil d'agent

**Fichiers :**

- Créer : `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Modifier : `packages/webui/src/components/toolcalls/index.ts`
- Modifier : `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Modifier : `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Étape 1 : Implémenter le rendu minimal**

- Ajouter une vérification pour `rawOutput.type === 'task_execution'`.
- Afficher la description de la tâche comme en-tête.
- Afficher le nom et le statut de l'agent, les outils enfants en cours d'exécution, le résumé de fin et la raison d'échec/annulation.
- Garder la mise en page compatible avec plusieurs cartes d'agent parallèles en rendant chaque appel d'outil indépendamment.

**Étape 2 : Exécuter le test de rendu ciblé**

Exécutez : `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Résultat attendu : succès.

### Tâche 5 : Vérifier la surface intégrée

**Fichiers :**

- Modifier : `packages/webui/src/index.ts`

**Étape 1 : Exporter le nouveau composant partagé si nécessaire**

- Ré-exporter tout nouveau composant/type requis par VSCode ou `ChatViewer`.

**Étape 2 : Exécuter la vérification du package**

Exécutez : `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Exécutez : `npm run check-types --workspace=packages/vscode-ide-companion`
Exécutez : `npm run typecheck --workspace=packages/webui`

Résultat attendu : tous les tests et vérifications de types ciblés passent.
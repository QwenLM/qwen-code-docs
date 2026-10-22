# Demander un workflow pour un tour


Avec `tools.workflowsEnabled` activé, incluez `ultracode` ou le mot-clé
`workflow` existant dans une soumission humaine pour suggérer l'utilisation
de l'outil Workflow pour ce tour. Par exemple : `ultracode: audit these three modules`.
Le modèle décide si un workflow correspond à la demande. Le mot-clé ne
démarre pas un workflow, ne modifie pas les permissions, ne sélectionne pas un modèle,
et ne modifie pas l'effort.

L'entrée terminal dans Ink et OpenTUI, l'entrée du composer IDE, et l'entrée
du composer Web Shell prennent en charge ce rappel. Il est ajouté à la requête
du modèle séparément de votre message affiché. La prochaine soumission ordinaire
ne l'hérite pas. Les continuations d'outil et les tentatives automatiques ne
l'ajoutent pas à nouveau. Le texte collé dans le composer compte comme une entrée
humaine ; les expansions de pièces jointes et le contexte ajouté par un hook ne
comptent pas.

L'historique rappelé et les collages du registre Vim Ink restent des entrées
inconnues, y compris après avoir vidé le tampon ou désactivé Vim. Une nouvelle
saisie en mode insertion Vim peut toujours activer le rappel.

`ultracode` ignore les spans complets entre guillemets/code et les tokens de
type chemin tels que `ultracode.js`, `x-ultracode`, ou `ultracode/file`. La
règle de compatibilité `workflow` existante accepte les mots isolés séparés par
des espaces avec une ponctuation en bordure, comme `(workflow)`, mais pas
`workflows` ou `my-workflow-runner`. Lorsque les deux mots-clés apparaissent,
un seul rappel est ajouté.

Les `qwen -p` simples, les entrées stdin simples, les entrées planifiées, et
les prompts SDK sous forme de chaîne n'activent pas automatiquement l'opt-in.
L'entrée streaming du SDK TypeScript peut identifier explicitement chaque
message humain original :

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

Omettez `origin` pour le contexte généré par l'application, l'automatisation,
les résultats d'outil, et la relecture d'historique. Une origine manquante ou
invalide laisse le chat normal fonctionner sans le rappel de mot-clé. La
déclaration n'accorde aucune permission d'outil. Les clients ACP peuvent
utiliser la déclaration `_meta['qwen.submittedPrompt']` par requête existante
pour le texte humain original ; les métadonnées privées du démon restent
réservées.

Définissez `ui.disableWorkflowKeywordTrigger` à `true` pour désactiver les
deux mots-clés à travers ces points d'entrée. Dans la boîte de dialogue des
paramètres du terminal, il s'agit de **Disable Workflow Keyword Trigger** et
prend effet pour les nouvelles soumissions. Le rappel est également omis
lorsque les workflows ou la surface d'outil requise sont indisponibles. Une
session workflow par nom uniquement suggère uniquement les workflows
sauvegardés avec `{ name, args }` ; elle ne suggère pas d'écrire un script.
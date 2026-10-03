# Computer Use

Qwen Code inclut un skill `computer-use` qui apprend au modèle à piloter les applications de bureau via deux packages installés séparément :

```text
bundled computer-use skill
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> native cua-driver accessibility backend
```

Qwen Code ne bundle pas le serveur MCP, le SDK ni le driver natif. Le skill installe automatiquement les packages externes lorsqu'ils sont manquants.

> [!warning]
>
> Computer Use peut lire l'UI des applications et contrôler les entrées souris et clavier. Utilisez-le uniquement dans des environnements fiables et vérifiez attentivement les approbations MCP.

## Configuration automatique

Node.js 22 ou ultérieur et npm sont requis.

Lors de sa première utilisation, le skill exécute lui-même ces commandes :

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.7
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.11
```

Redémarrez Qwen Code après l'ajout initial du serveur MCP. Le skill reprend alors la tâche de bureau via `node_repl`.

L'installation du SDK laisse `package.json` et le lockfile inchangés, mais écrit dans le `node_modules` du workspace. Son postinstall télécharge et vérifie le payload natif pour la plateforme courante.

Supprimer la configuration MCP ou l'installation du SDK dans le workspace désactive le chemin d'exécution ; il n'y a pas de fallback hérité.

## Utilisation

Demandez à Qwen Code d'utiliser `$computer-use` pour la tâche de bureau. Après le bootstrap, il utilise le workflow app sur macOS :

1. lie l'application avec `computer.getApp(nameOrIdentifierOrPath)` ;
2. lit `app.getState()` pour un texte d'accessibilité compact, suivi de mises à jour incrémentales automatiques ;
3. effectue une ou plusieurs actions en utilisant les IDs d'éléments courts dans ce texte ;
4. récupère le dernier état avant de décider quoi faire ensuite ; et
5. ferme le client SDK et réinitialise le REPL uniquement lorsqu'aucun autre état persistant n'est nécessaire.

Le driver est le seul composant qui calcule les diffs d'observation. Le code du modèle utilise les méthodes typées du SDK et ne dispatche pas de noms d'outils du driver arbitraires. Le handle d'app suit la fenêtre courante et les dialogues, conserve l'identité des éléments natifs en interne, et délègue les entrées au driver natif. Le code du modèle ne choisit pas les modes foreground/background. Les actions non confirmées ne sont pas rejouées. `getState()` peut ouvrir une application arrêtée découverte ; les actions ne la redémarrent jamais. Les APIs exact-window existantes restent disponibles sur Windows et Linux.

```js
const app = await computer.getApp('Microsoft Excel');
nodeRepl.write((await app.getState()).text);
// Use an element ID from the returned state.
await app.click(37);
await app.typeText('hello');
nodeRepl.write((await app.getState()).text);
```

Actualisez l'état après avoir ouvert ou fermé une boîte de dialogue avant de réutiliser les IDs d'éléments. Chaque actualisation de l'état App capture le screenshot courant en interne. Le retour par défaut le garde masqué ; demandez-le explicitement avec `app.getState({ includeScreenshot: true })` lorsque le modèle a besoin de l'image.

## Permissions

Le Node REPL est un serveur MCP qui exécute du JavaScript écrit par le modèle avec les autorisations ordinaires de Node.js. Ses appels suivent le [flux d'approbation MCP](./approval-mode.md) normal de Qwen Code. Le SDK applique également l'autorisation native.

Sur macOS, l'observation de l'accessibilité et les entrées nécessitent la permission Accessibility. Les captures d'écran nécessitent en plus la permission Screen Recording. macOS peut attribuer l'octroi au terminal ou à l'IDE qui a lancé Qwen Code. Windows et Linux utilisent leurs facilités d'accessibilité et d'entrée propres à chaque plateforme.

## Utiliser l'ordinateur devant vous depuis une session distante

Lorsque Qwen Code s'exécute sur une machine headless (une machine de dev, un serveur), le skill peut toujours piloter le bureau auquel vous êtes assis : cet ordinateur prête son propre `node_repl` à une session distante. Cela fonctionne sur macOS aujourd'hui.

Configurez-le une seule fois sur votre ordinateur :

```bash
npx -y @qwen-code/node-repl-mcp@0.1.7 desktop-relay install
```

Cela installe `node_repl` et le SDK sous `~/.qwen/desktop-relay` et enregistre un socket launchd sur `127.0.0.1:47821`. Rien ne s'exécute en arrière-plan ; launchd ne démarre un processus de courte durée que lorsque quelque chose se connecte.

- **Depuis le Web Shell.** Le démon distant doit s'exécuter avec `QWEN_SERVE_CLIENT_MCP_OVER_WS=1`, et le Web Shell doit être une page sécurisée (https, ou `http://localhost` via un tunnel SSH). Dans une session, choisissez **Use this computer** dans le pied de page de la barre latérale, puis **Connect this computer**.

Une boîte de dialogue sur votre ordinateur vous demande d'autoriser chaque connexion. Une session autorisée peut exécuter du code sur votre ordinateur avec vos permissions, voir et contrôler son écran, tout comme le Computer Use local, jusqu'à ce que vous la déconnectiez ou qu'elle se termine. macOS demande d'autoriser `node` pour Accessibility et Screen Recording la première fois.

## Dépannage

- Si `node_repl` est toujours indisponible après la configuration automatique, redémarrez Qwen Code et vérifiez le serveur avec `qwen mcp list`.
- Si l'import du SDK échoue toujours après la configuration automatique, confirmez que Qwen Code s'exécute depuis le workspace où le package a été installé.
- Après un timeout, une annulation, une réinitialisation ou un crash du noyau, bootstrappez à nouveau le client SDK et demandez un état frais.

## Voir aussi

- [Skills](./skills.md)
- [Serveurs MCP](./mcp.md)
- [Mode d'approbation](./approval-mode.md)
- [Sandboxing](./sandbox.md)

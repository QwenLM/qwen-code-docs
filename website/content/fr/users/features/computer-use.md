# Computer Use

Computer Use s'exécute via le serveur MCP Node REPL autonome. Son premier appel `js` charge le `cua` global et affiche la documentation pour la plateforme courante. Computer Use et Browser Use ne nécessitent plus de skills intégrés.

```text
Qwen Code / n'importe quel client MCP
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> Qwen CUA Driver natif (applications de bureau)
     -> @qwen-code/browser-use (extension de navigateur Qwen)
```

## Configuration

Node.js 22 ou ultérieur et npm sont requis. Enregistrez le serveur MCP, puis redémarrez Qwen Code :

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

Le serveur installe le SDK correspondant et le SDK navigateur comme dépendances. Le payload du SDK natif est téléchargé pour la plateforme courante et vérifié par rapport aux checksums SHA-256 de la release correspondante. Il est mis en cache en dehors du package npm ; aucune commande de bootstrap SDK du workspace n'est nécessaire. La version 0.26.0 est une cible de développement local jusqu'à ce que sa release soit publiée.

Windows utilise la livraison d'entrées ordinaire par défaut et n'installe pas de worker UIAccess.
L'opt-in à UIAccess avec `CUA_DRIVER_USE_UIACCESS=1` nécessite un worker signé
sous `Program Files\Qwen\CuaDriver` ; installez le SDK depuis un terminal
élevé avec cette variable définie. Un worker non signé ne peut pas activer UIAccess ;
ne contournez pas la vérification de signature. Les anciennes releases non signées nécessitent une nouvelle
release signée du driver pour UIAccess, pas une réinstallation de la même version.

## Tâches applicatives

```js
var app = await cua.getApp('Microsoft Excel');
// Utilisez un ID court de l'état AX affiché automatiquement.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` affiche le texte AX complet sans image. `getAXState` affiche les diffs ultérieurs. `getScreenshot` capture uniquement la fenêtre courante ; `getAXStateAndScreenshot` capture les deux. Les observations retournent des chaînes et s'affichent elles-mêmes ; `{emit:false}` supprime la sortie. Demandez un screenshot avant d'utiliser les coordonnées `{x,y}`, qui sont des pixels dans le screenshot courant de cette fenêtre.

Le driver résout les applications/fenêtres, possède les IDs courts et coordonnées courants, et choisit la livraison des entrées. macOS utilise l'accessibilité et les événements dirigés. Windows et Linux essaient d'abord la livraison en arrière-plan et n'utilisent les entrées au premier plan qu'après un refus qui prouve que rien n'a été envoyé. Les entrées au premier plan s'arrêtent lorsque l'activité physique de l'utilisateur est détectée ; elles restaurent l'application précédente uniquement si l'utilisateur n'est pas passé ailleurs. Un accusé de réception de dispatch ne prouve pas que l'interface a changé : observez avant de réessayer.

Linux prend en charge X11, y compris les applications X11 sous XWayland. Les applications Wayland natives ne sont pas prises en charge. Passez DISPLAY, XAUTHORITY et le bus de session d'accessibilité du bureau au serveur.

## Tâches de bureau et de navigateur

Utilisez l'interface de bureau explicite pour les tâches plein écran :

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

Les coordonnées du bureau sont des pixels dans le dernier screenshot de l'affichage principal. Les entrées du bureau contrôlent le bureau visible au premier plan et peuvent déplacer le pointeur réel. Pour les touches maintenues, utilisez toujours `try/finally` avec `cua.desktop.keyDown(key)` et `keyUp(key)`. Les touches maintenues appartiennent à la session appelante et sont libérées lors d'un reset/fin gracieuse. Tout en maintenant les touches, utilisez `keyDown/keyUp` pour les accords et les actions de pointeur de bureau sans modificateurs explicites ; relâchez-les avant le texte, les raccourcis ordinaires ou les entrées applicatives. La terminaison abrupte du processus OS ne peut pas garantir le nettoyage.

```js
var browser = await cua.getBrowser('Chrome');
// La documentation du navigateur et les onglets sont affichés lors de la première sélection.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`, `getTab`, et `createBrowserTab` retournent les handles du SDK browser-use du navigateur existant. Suivez la documentation du runtime du navigateur sélectionné et connectez l'extension de navigateur Qwen comme auparavant. L'intégration n'ajoute aucune API de fenêtres de navigateur, diff DOM ou support Windows.

## Permissions et cycle de vie

Le serveur exécute JavaScript avec les permissions ordinaires de Node.js et suit le flux d'approbation MCP du client. Sur macOS, Accessibility est requis pour l'observation des entrées/AX et Screen Recording pour les screenshots ; Automation peut être demandé pour la sauvegarde de documents/le renommage Finder. Les octrois appartiennent à la chaîne de responsabilité OS du processus hôte. Sur Windows, le démon installé normal utilise le chemin UAC/tâche de connexion existant ; les applications qu'il lance utilisent un token dérivé de son propre token à l'intégrité utilisateur normal. UIAccess est optionnel : définir explicitement `CUA_DRIVER_USE_UIACCESS=1` requiert un worker signé fiable sous Program Files et échoue si indisponible. L'installation npm par défaut ne prépare pas ce worker et ne requiert pas sa signature.

`js` se termine en un seul appel et a un timeout par défaut de 30 secondes. Un timeout peut avoir des effets externes ; observez avant de réessayer. `js_reset` écarte les bindings et ferme gracieusement la session native/navigateur possédée. Après la compaction de contexte, appelez `cua.rewriteDocumentation()` avant de continuer.

## Relais de bureau à distance

Pour une configuration de relais de bureau macOS existante, installez son serveur correspondant :

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

Cela utilise le socket launchd local existant à `127.0.0.1:47821`. Dans un Web Shell sécurisé, choisissez **Use this computer**, puis **Connect this computer**. Le bureau demande une confirmation pour chaque connexion. Le démon distant doit activer `QWEN_SERVE_CLIENT_MCP_OVER_WS=1`.

## MCP direct et dépannage

`qwen-cua-driver mcp` expose les 19 opérations Computer Use natives directement. Les appels applicatifs utilisent `app` ; les appels capables de bureau utilisent `scope:"desktop"` à la place. `key_down/key_up` sont bureau uniquement. Les outils natifs avancés restent disponibles via l'opt-in hôte `CUA_DRIVER_EXTRA_TOOLS=1`.

Si le serveur est indisponible, vérifiez `qwen mcp list` et redémarrez le client après l'avoir ajouté. Si la capture échoue, vérifiez la session de bureau courante et les permissions OS. Si le téléchargement natif échoue, vérifiez la version/checksum exacte de la release ou fournissez un payload correspondant construit localement via `QWEN_CUA_SDK_NATIVE_DIR`. Un bureau verrouillé ne peut pas fournir de preuve d'acceptation de l'interface graphique.

Voir [Serveurs MCP](./mcp.md), [Mode d'approbation](./approval-mode.md) et [Sandboxing](./sandbox.md).

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
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.2
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.3
```

Redémarrez Qwen Code après l'ajout initial du serveur MCP. Le skill reprend alors la tâche de bureau via `node_repl`.

L'installation du SDK laisse `package.json` et le lockfile inchangés, mais écrit dans le `node_modules` du workspace. Son postinstall télécharge et vérifie le payload natif pour la plateforme courante.

Supprimer la configuration MCP ou l'installation du SDK dans le workspace désactive le chemin d'exécution ; il n'y a pas de fallback hérité.

## Utilisation

Demandez à Qwen Code d'utiliser `$computer-use` pour la tâche de bureau. Après le bootstrap, il suit le workflow Computer Use standard :

1. découvre l'application et la fenêtre exactes ;
2. observe l'état complet de l'accessibilité ;
3. agit via les tokens d'éléments sémantiques courants lorsque possible ;
4. récupère l'état frais après chaque mutation ;
5. vérifie le résultat demandé ; et
6. ferme le client SDK et réinitialise le REPL.

Le driver est le seul composant qui calcule les diffs d'observation. Le code du modèle utilise les méthodes typées du SDK et ne dispatche pas de noms d'outils du driver arbitraires.

## Permissions

Le Node REPL est un serveur MCP qui exécute du JavaScript écrit par le modèle avec les autorisations ordinaires de Node.js. Ses appels suivent le [flux d'approbation MCP](./approval-mode.md) normal de Qwen Code. Le SDK applique également l'autorisation native.

Sur macOS, l'observation de l'accessibilité et les entrées nécessitent la permission Accessibility. Les captures d'écran nécessitent en plus la permission Screen Recording. macOS peut attribuer l'octroi au terminal ou à l'IDE qui a lancé Qwen Code. Windows et Linux utilisent leurs facilités d'accessibilité et d'entrée propres à chaque plateforme.

## Dépannage

- Si `node_repl` est toujours indisponible après la configuration automatique, redémarrez Qwen Code et vérifiez le serveur avec `qwen mcp list`.
- Si l'import du SDK échoue toujours après la configuration automatique, confirmez que Qwen Code s'exécute depuis le workspace où le package a été installé.
- Après un timeout, une annulation, une réinitialisation ou un crash du noyau, bootstrappez à nouveau le client SDK et demandez un état frais.

## Voir aussi

- [Skills](./skills.md)
- [Serveurs MCP](./mcp.md)
- [Mode d'approbation](./approval-mode.md)
- [Sandboxing](./sandbox.md)

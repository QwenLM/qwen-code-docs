# Reconnexion forcée MCP du démon

## Problème

`POST /workspace/mcp/reload` recharge les paramètres persistés mais
réconcilie les connexions MCP de manière incrémentale. Un serveur dont les
paramètres sont inchangés conserve son transport existant. Les credentials
OAuth écrits par un autre processus Qwen Code ne sont donc pas lus tant que
ce transport ne se reconnecte pas.

## Conception

Ajouter les champs optionnels `forceReconnectAll` et `forceReconnectWhich`
aux deux routes de rechargement MCP de workspace et à leurs méthodes de
bridge SDK/ACP. `forceReconnectAll` vaut `false` par défaut ;
`forceReconnectWhich` sélectionne des serveurs nommés. Les champs sont
mutuellement exclusifs.

Lorsqu'une des deux options de reconnexion est fournie, le démon effectue
d'abord la réconciliation normale des paramètres. Il reconnecte ensuite tous
les serveurs MCP configurés du workspace, ou uniquement les noms sélectionnés
par `forceReconnectWhich` :

- les serveurs en pool redémarrent via le pool de transports du workspace,
  une fois par nom de serveur, puis rafraîchissent les snapshots d'outils du
  modèle pour les configurations live ;
- les serveurs sans entrée de pool utilisent le chemin de découverte par
  configuration existant, qui déconnecte et reconnecte avant la
  redécouverte.

Cela ne déclenche délibérément pas OAuth. Cela provoque uniquement une
nouvelle connexion, qui lit les credentials actuellement persistés par le
stockage de tokens du démon.

## API

`POST /workspace/mcp/reload` et
`POST /workspaces/:workspace/mcp/reload` acceptent :

```json
{ "forceReconnectAll": true }
```

`forceReconnectWhich` accepte un tableau de noms de serveur non vides. Les
valeurs invalides renvoient 400.
La réponse reste `202 { "accepted": true }` car le travail est mis en file.

## Vérification

- Les tests de route couvrent la transmission par défaut, la transmission de
  `true` et les entrées invalides.
- Les tests ACP couvrent la propagation à chaque configuration live et le
  comportement de reconnexion forcée.
- Le plan E2E documente un scénario de token OAuth écrit en externe.

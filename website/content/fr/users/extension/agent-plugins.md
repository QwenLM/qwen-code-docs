# Agent Plugins v1

Qwen Code charge nativement les packages portables [Agent Plugins v1](https://agent-plugins.org/). Le package conserve ses fichiers standard `plugin.json`, `mcp.json` et `SKILL.md` : l'installation ne génère pas de `qwen-extension.json` et ne réécrit pas les fichiers portables.

Utilisez les commandes d'extension existantes avec un répertoire local, un lien, une archive, un dépôt Git, une URL d'archive ou un package npm scopé :

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

Le manifeste racine doit cibler le schéma v1 canonique :

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## Capacités prises en charge

| Capacité                                   | Support                                  |
| ------------------------------------------ | ---------------------------------------- |
| `skills/*/SKILL.md` en enfant direct       | Oui                                      |
| Serveurs MCP stdio                         | Oui                                      |
| Serveurs MCP Streamable HTTP               | Oui                                      |
| Serveurs MCP HTTP+SSE legacy               | Non ; l'entrée est ignorée               |
| Commandes, agents et hooks                 | Non ; ces répertoires sont ignorés       |
| Contexte, paramètres, canaux et apps Qwen  | Non                                      |
| Namespaces client `extensions.*`           | Non ; les namespaces non implémentés sont ignorés |

Les skills suivent la [spécification Agent Skills](https://agentskills.io/specification).
Un skill invalide est ignoré sans désactiver les skills valides frères. Le
champ expérimental `allowed-tools` est reconnu comme une chaîne mais n'accorde
pas d'outils Qwen pré-approuvés.

Pour les serveurs MCP stdio, Qwen Code expande `${PLUGIN_ROOT}` et `${PLUGIN_DATA}`
une fois dans `args`, les valeurs d'environnement et `cwd`. `PLUGIN_DATA` est un
répertoire accessible en écriture par installation dont le contenu persiste à travers les mises à jour et réinstallations.
Les endpoints MCP distants doivent utiliser HTTPS, à l'exception des endpoints HTTP en loopback.

Agent Plugins v1 est un format de package, pas une intégration de marketplace. Installez
les packages via les sources d'extension existantes de Qwen Code.

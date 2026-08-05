# Filtrage des payloads de modèle MCP

## Objectif

Empêcher `packages/cua-driver` et `packages/mobile-mcp` de renvoyer des
termes fournisseur connus dans les payloads MCP textuels tout en préservant
les véritables valeurs locales nécessaires pour manipuler les applications,
fenêtres, appareils et paquets.

Le filtrage est opt-in et désactivé par défaut. Réglez
`MCP_MODEL_PAYLOAD_FILTER=1` dans l'environnement du serveur MCP pour les
routes API qui rejettent ces termes. Les utilisateurs sur d'autres routes
conservent les payloads d'origine.

Les termes ASCII initiaux, insensibles à la casse, sont `qwen`, `dashscope`,
`alibaba`, `aliyun`, `aliyuncs`, `alicloud`, `tongyi`, `qianwen`, `antgroup`,
`bailian`, `modelscope`, `damo`, `lingma`, `wanx`, `alipay`, `antfin`,
`yuque`, `dingtalk`, `taobao`, `tmall`, `qoder` et `maxcompute`. Les termes
chinois sont comparés exactement : `通义`, `千问`, `阿里`, `百炼`, `魔搭`,
`达摩`, `灵码`, `万相`, `支付宝`, `蚂蚁`, `语雀`, `钉钉`, `淘宝` et
`天猫`. Les variantes avec séparateur sont aussi comparées pour les noms en
plusieurs parties, comme `q-wen`, `dash_scope`, `ali cloud`, `qian-wen` et
`ant_group`.

## Encodage

Chaque sous-chaîne correspondante est remplacée par un token sans état
contenant ses octets UTF-8 en hexadécimal. Par exemple, un nom d'application
filtré reste lisible autour du token, et renvoyer cette valeur au même
serveur MCP restaure la sous-chaîne d'origine exacte avant la validation et
l'exécution de l'outil. Cela évite une carte de session et maintient les
allers-retours application/paquet/chemin fonctionnels après les redémarrages
de processus.

Les ids et méthodes JSON-RPC ne sont jamais transformés. Les clés d'objet et
les valeurs textuelles à l'intérieur des payloads de résultat, d'erreur et de
notification sont transformées récursivement. Les champs `data` d'image et
d'audio sont préservés octet par octet.

## Limites des composants

Dans cua-driver, `Response::ok` et `Response::error` sont la limite partagée
orientée modèle pour les réponses MCP directes stdio, HTTP et proxy de démon.
Les noms et arguments d'appels d'outil sont décodés dans
`Request::tool_call` avant la distribution. Les deux directions n'appliquent
la transformation que lorsque `MCP_MODEL_PAYLOAD_FILTER=1`.

Dans mobile-mcp, un wrapper de transport encode les payloads JSON-RPC
sortants et décode les payloads entrants avant que le SDK n'effectue la
validation de schéma. Une petite sous-classe `McpServer` applique le wrapper
à stdio, SSE, aux tests en mémoire et aux transports futurs lorsque
`MCP_MODEL_PAYLOAD_FILTER=1` ; sinon elle connecte le transport d'origine
inchangé.

## Non-objectifs

Cela ne renomme ni les applications installées, ni les processus, ni les
bundles, ni les paquets npm, ni les identités de signature, ni les dépôts, ni
les URL de distribution. Cela ne transforme ni stderr, ni la télémétrie, ni
les logs de build. Les octets d'image sont préservés, donc le filtrage basé
sur l'OCR sort de cette garantie de payload textuel.

Les alias ne sont décodés que lorsqu'ils sont renvoyés au même composant MCP.
Passer un alias à un shell ou à un autre serveur ne récupère pas la valeur
locale.

## Vérification

- Tester unitairement chaque terme, les casses mixtes, le texte chinois, les
  objets et clés imbriqués, les tokens invalides, les allers-retours exacts
  et la préservation du contenu binaire.
- Vérifier que la limite orientée modèle est inchangée par défaut et filtrée
  uniquement lorsque `MCP_MODEL_PAYLOAD_FILTER=1` est présent.
- Exercer les réponses réelles MCP initialize, tools/list, succès, succès
  structuré et erreur pour les deux composants.
- Relancer les payloads observés de permission, santé, application et fenêtre
  de cua ainsi que l'écho d'erreur mobile déterministe.

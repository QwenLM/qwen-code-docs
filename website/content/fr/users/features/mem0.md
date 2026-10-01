# Mem0

Mem0 connecte Qwen Code à un service de mémoire externe. Il est inclus dans le package CLI principal : n'installez pas ` @qwen-code/external-context-mem0` et n'enregistrez pas de serveur MCP séparé pour ce chemin.

## Connexion

Fusionnez ceci dans les paramètres utilisateur (`~/.qwen/settings.json`), puis redémarrez Qwen Code dans un projet fiable. Comme `modelProviders`, `envKey` nomme la variable d'identifiant et le champ `env` de premier niveau peut fournir sa valeur :

```json
{
  "env": {
    "MEM0_API_KEY": "<your-provider-key>"
  },
  "memory": {
    "mem0": {
      "baseUrl": "https://your-mem0-endpoint.example",
      "protocol": "mem0-v2",
      "envKey": "MEM0_API_KEY"
    }
  }
}
```

Cette configuration dans un seul fichier ne nécessite pas d'export shell. Les identifiants en JSON sont en clair : conservez-les dans les paramètres utilisateur, ne les commitez pas dans un dépôt, et évitez de partager le fichier dans des rapports. Alternativement, omettez l'entrée `env` de premier niveau et définissez la clé dans le shell de lancement ou `~/.qwen/.env`. Les valeurs d'environnement de processus non vides prennent le pas sur les valeurs `.env`, qui prennent le pas sur `settings.env`.

Utilisez l'origine du point de terminaison, éventuellement avec un préfixe de reverse-proxy ; n'ajoutez pas `/v2/memories/search` ou un autre chemin d'opération. Choisissez le contrat que votre service implémente réellement :

- `mem0-v2` (par défaut) : `Authorization: Token` de style PolarDB, recherche V2 utilisant `limit`, écriture V1.
- `mem0-v3` : Mem0 Platform V3, `Authorization: Token`, recherche/ajout V3.
- `mem0-oss-2026-08` : contrat REST OSS épinglé, `X-API-Key`, `/search` et `/memories`.

Ce sont des contrats complets, pas une compatibilité de version universelle. Les versions inconnues et les formats de requête/réponse différents nécessitent un adaptateur vérifié, pas une URL renommée. Les ID de préréglages historiques restent acceptés ; `aliyun-polardb-mysql-2026-08` conserve son champ de recherche historique `top_k` et le contenu de recherche brut.

Une adresse PolarDB fiable telle que `http://your-endpoint:8080` nécessite également `"allowInsecureHttp": true`. Le HTTP en clair envoie l'identifiant non chiffré. Ce paramètre ne rend pas un point de terminaison privé accessible et ne contourne pas les listes blanches IP.

Qwen enregistre automatiquement `external-context` et découvre `context_search`. Demandez à Qwen de rechercher dans la mémoire externe ; rien n'est rappelé ni envoyé automatiquement à chaque tour. Un serveur du même nom dans les paramètres opérateur, la configuration de session ou `--mcp-config` entre en conflit ; supprimez cette configuration manuelle lors du passage au chemin intégré. Les paramètres de workspace et les entrées `.mcp.json` de projet portant ce nom sont surchargés. La précédence MCP existante masque également un serveur d'extension du même nom, donc désactivez l'extension external-context avancée lors de l'utilisation du chemin intégré. Supprimez également son ancien Hook de confirmation d'écriture manuelle pour éviter les confirmations en double ; un Hook utilisateur avec le même matcher ne remplace pas la confirmation intégrée.

## Portée et écritures

La portée utilisateur/dépôt par défaut survit aux redémarrages et au démarrage depuis des sous-répertoires Git. Le déplacement du dépôt ou l'utilisation d'un autre checkout la modifie, y compris les worktrees temporaires `--worktree` et les worktrees d'isolation d'agent. Pour réutiliser une portée connue entre les worktrees, définissez `scope.userId` pour V2/OSS ou `scope.appId` pour V3 ; `scope.agentId` optionnel s'applique uniquement à V2/OSS. Les identifiants de portée ne sont pas des contrôles d'accès côté fournisseur.

La recherche est en lecture seule par défaut. Pour activer la sauvegarde, ajoutez `"enableWrites": true` dans `memory.mem0`, redémarrez le CLI interactif, et demandez à Qwen de sauvegarder du contenu spécifique. Le Hook installé automatiquement vous demande d'approuver le contenu exact, y compris en mode YOLO. Refuser n'envoie aucune requête d'écriture. Les écritures utilisent `infer: false`.

PolarDB peut renvoyer un tableau de messages utilisateur unique encodé en JSON pour ces importations directes. `mem0-v2` restaure le texte exact de ce message lorsque le résultat est marqué `infer: false` ; le préréglage historique `aliyun-polardb-mysql-2026-08`, le texte ordinaire et les autres protocoles restent inchangés.

Les sessions non interactives/ACP et les sessions avec les Hooks désactivés conservent uniquement la recherche. Le mode bare/safe, les dossiers non fiables/provisoires et les workspaces SSH n'activent pas cette liaison locale. Les paramètres de workspace ne peuvent pas configurer la liaison.

`stored` signifie que des ID synchrones valides ont été renvoyés. `accepted` signifie qu'une requête asynchrone a été acceptée, pas que la persistance est terminée. `failed` signifie un rejet définitif : corrigez la cause signalée avant de réessayer. `unknown` signifie que l'écriture a pu se produire : ne réessayez pas automatiquement.

## Options et dépannage

`envKey` a pour valeur par défaut `MEM0_API_KEY` ; utilisez-la pour référencer une autre variable d'identifiant et définir cette valeur via l'une des sources ci-dessus. Le champ historique `credentialEnv` reste un alias compatible. Si les deux champs sont définis, leurs noms doivent correspondre ; des noms conflictuels produisent une erreur au lieu de sélectionner silencieusement un identifiant. `timeoutMs` a pour valeur par défaut 5000, entre 1 et 30000.

Vérifiez l'état de connexion MCP pour les identifiants manquants et les erreurs fournisseur. Un timeout nécessite de vérifier le routage du point de terminaison, les listes blanches d'IP source et la disponibilité du service. Un 401/403 nécessite de vérifier l'identifiant et le protocole sélectionné. Ne collez pas d'identifiants dans les logs ou les rapports de bug.

Pour les checkouts source, build et bundle une fois pour que `dist/mem0/main.js` et `dist/mem0/write-confirmation.js` existent. Les packages principaux installés incluent les deux. Cette fonctionnalité nécessite une release CLI principale contenant le changement ; la publication d'un package Mem0 autonome n'est pas requise.
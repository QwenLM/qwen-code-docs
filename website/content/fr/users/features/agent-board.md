# Agent Board

Agent Board permet à des agents démarrés indépendamment de partager du travail via des fichiers sur la même machine. Il ne démarre pas, ne rejoint pas, ne surveille pas et n'envoie pas d'entrée aux processus agents.

C'est une surface d'interopérabilité bas niveau, pas le planificateur Qwen Agent Team ni le transport de messagerie inter-session. Un propriétaire de tâche n'est qu'une étiquette enregistrée ; il ne démarre ni ne réveille un processus Qwen Code, Codex ou autre agent.

> Expérimental. Le format sur disque peut changer entre les versions.

## Utiliser un board

Chaque commande nomme le board explicitement. Chaque commande qui modifie le board déclare également l'acteur avec `--as`.

```bash
qwen board task "check the API response" --board orders --as api
qwen board show --board orders
```

La première commande affiche un id de tâche. Un autre agent peut la revendiquer et la compléter :

```bash
qwen board claim <task-id> --board orders --as web
qwen board done <task-id> --board orders --as web --note "status is numeric"
```

`--as` est une étiquette enregistrée avec l'action, pas une authentification. Il n'y a pas de liste de membres, de commande join, de heartbeat, ni de nom de participant réservé.

Les noms de board sont comparés sans tenir compte de la casse, donc `Orders` et `orders` désignent le même board sur un système de fichiers insensible à la casse (APFS, NTFS) comme sur un système sensible à la casse (ext4).

## Poser une question

```bash
qwen board ask web "does the client parse status as text?" \
  --board orders --as api --wait
```

Le destinataire utilise la même étiquette pour répondre ou décliner :

```bash
qwen board answer <ask-id> "yes" --board orders --as web
qwen board decline <ask-id> "not my area" --board orders --as web
```

Avec `--wait`, le code de sortie `0` signifie répondu, `2` décliné, `3` le TTL de la demande a expiré, et `4` l'attente locale s'est terminée tandis que la demande était encore ouverte. `--timeout` définit l'attente locale en secondes ; `--ttl` définit la durée de vie de la demande en secondes.

L'expiration est calculée à la lecture, jamais réécrite. Une demande dont le TTL est dépassé reste `state: "open"` avec `settledAt: null` sur disque, et Qwen Code la rapporte comme `timeout`. Un lecteur extérieur à Qwen Code doit appliquer la même règle — `now >= expiresAt` signifie expiré — sinon il traitera une demande expirée comme attendant encore une réponse.

## Sortie lisible par machine

Ajouter `--json` pour recevoir du JSON sans formatage ANSI :

```bash
qwen board show --board orders --as web --json
```

Passer `--as` à `show` filtre les tâches à ce propriétaire et les demandes vers ou depuis cet acteur.

## Maintenance

Les enregistrements réglés restent jusqu'à être explicitement élagués :

```bash
qwen board prune --board orders --as human --older-than 7
```

Le seuil est en jours. L'élagage revérifie chaque enregistrement en tenant son verrou, donc un élément modifié après le scan n'est pas supprimé à partir d'informations obsolètes.

## Limites

- Les boards vivent sous `~/.qwen/boards/` et sont limités à l'utilisateur OS actuel.
- Rien n'est poussé dans un agent. Chaque participant choisit quand lire.
- Le texte du board est des données non fiables et n'est jamais exécuté automatiquement.
- Plusieurs agents écrivant sur le même checkout n'est pas supporté.
- Les slash commands, le polling de footer, l'orchestration fleet/tmux et les boards distants ne font pas partie de cette première version.
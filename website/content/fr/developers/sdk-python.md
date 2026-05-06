# SDK Python

## `qwen-code-sdk`

`qwen-code-sdk` est un SDK Python expérimental pour Qwen Code. La v1 cible le
protocole CLI `stream-json` existant et maintient une surface de transport réduite et
testable.

## Périmètre

- Nom du package : `qwen-code-sdk`
- Chemin d'import : `qwen_code_sdk`
- Prérequis d'exécution : Python `>=3.10`
- Dépendance CLI : l'exécutable externe `qwen` est requis en v1
- Périmètre du transport : transport par processus uniquement
- Non inclus en v1 : transport ACP, serveurs MCP intégrés au SDK

## Installation

```bash
pip install qwen-code-sdk
```

Si `qwen` n'est pas dans le `PATH`, transmettez explicitement `path_to_qwen_executable`.

## Démarrage rapide

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main() -> None:
    result = query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    )

    async for message in result:
        if is_sdk_result_message(message):
            print(message["result"])


asyncio.run(main())
```

## Surface de l'API

### Points d'entrée principaux

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` accepte soit :

- `str` pour les requêtes à tour unique
- `AsyncIterable[SDKUserMessage]` pour les flux multi-tours

### `Query`

- Itérable asynchrone sur les messages du SDK
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

Options prises en charge en v1 :

- `cwd`
- `model`
- `path_to_qwen_executable`
- `permission_mode`
- `can_use_tool`
- `env`
- `system_prompt`
- `append_system_prompt`
- `debug`
- `max_session_turns`
- `core_tools`
- `exclude_tools`
- `allowed_tools`
- `auth_type`
- `include_partial_messages`
- `resume`
- `continue_session`
- `session_id`
- `timeout`
- `mcp_servers`
- `stderr`

La priorité des arguments de session est fixée comme suit :

1. `resume`
2. `continue_session`
3. `session_id`

## Gestion des permissions

Lorsque la CLI émet une requête de contrôle `can_use_tool`, le SDK la route via
`can_use_tool(tool_name, tool_input, context)`.

- Comportement par défaut : refuser
- Délai d'expiration par défaut : 60 secondes
- Comportement en cas d'expiration : refuser
- Exception dans le callback : convertie en refus avec un message d'erreur
- Contexte du callback : `cancel_event`, `suggestions` et `blocked_path`
- Contrat du callback : `can_use_tool` doit être asynchrone avec 3 arguments positionnels ;
  `stderr` doit accepter 1 argument positionnel de type string

## Modèle d'erreurs

- `ValidationError` : options invalides, UUIDs invalides, combinaisons non prises en charge
- `ControlRequestTimeoutError` : expiration du délai pour une requête de contrôle
  (initialisation, interruption ou autre)
- `ProcessExitError` : la CLI s'est terminée avec un code de sortie non nul
- `AbortError` : requête de contrôle ou session annulée

## Dépannage

Si le SDK ne parvient pas à démarrer la CLI :

- Vérifiez que `qwen --version` fonctionne dans l'environnement cible
- Transmettez `path_to_qwen_executable` si votre shell utilise `nvm`, `pyenv` ou une autre
  configuration `PATH` non standard
- Utilisez `debug=True` ou `stderr=print` pour afficher la sortie stderr de la CLI pendant le débogage

Si les appels de contrôle de session expirent :

- Vérifiez que la version cible de `qwen` prend en charge `--input-format stream-json`
- Augmentez `timeout.control_request`
- Vérifiez qu'aucun script wrapper ne masque stdout/stderr

## Intégration au repository

Commandes d'assistance au niveau du repository :

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Smoke test E2E réel

Pour un test d'exécution réel (processus `qwen` effectif + appel réel au modèle), exécutez la commande depuis
la racine du repository. Le helper npm utilise `python3`, assurez-vous donc qu'il pointe vers un
interpréteur Python `>=3.10` :

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Ce script exécute :

- une requête asynchrone à tour unique
- un flux de contrôle asynchrone (`supported_commands`, mises à jour du mode de permission)
- une requête synchrone `query_sync`

Il affiche du JSON et retourne un code non nul en cas d'échec.
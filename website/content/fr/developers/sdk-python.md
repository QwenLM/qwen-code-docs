# SDK Python

## `qwen-code-sdk`

`qwen-code-sdk` est un SDK Python expérimental pour Qwen Code. La v1 cible le protocole CLI `stream-json` existant et maintient la surface de transport réduite et testable.

## Périmètre

- Nom du paquet : `qwen-code-sdk`
- Chemin d'import : `qwen_code_sdk`
- Exigence d'exécution : Python `>=3.10`
- Dépendance CLI : l'exécutable externe `qwen` est requis en v1
- Périmètre de transport : transport de processus uniquement
- Non inclus en v1 : transport ACP, serveurs MCP intégrés au SDK

## Installation

```bash
pip install qwen-code-sdk
```

Pour les versions préliminaires :

```bash
pip install --pre qwen-code-sdk
```

Si `qwen` n'est pas dans le `PATH`, passez explicitement `path_to_qwen_executable`.

Avant d'écrire du code SDK, assurez-vous que la CLI fonctionne dans le même terminal :

```bash
qwen --version
```

## Démarrage rapide

```python
import asyncio

from qwen_code_sdk import (
    is_sdk_assistant_message,
    is_sdk_result_message,
    query,
)


def extract_text(message):
    content = message.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return repr(content)
    texts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    return "".join(texts) if texts else "[no text content]"


def print_result(message):
    if message.get("is_error"):
        error = message.get("error") or {}
        print(f"Error: {error.get('message', 'Unknown error')}")
        return
    print(message.get("result", ""))


async def main() -> None:
    async with query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        async for message in result:
            if is_sdk_assistant_message(message):
                print(extract_text(message))
            elif is_sdk_result_message(message):
                print_result(message)


asyncio.run(main())
```

`asyncio.run()` est approprié pour les scripts autonomes. Si votre application exécute déjà une boucle d'événements (ex. Jupyter, FastAPI ou pytest-asyncio), appelez plutôt `await main()`.

## Utilisation synchrone

Utilisez `query_sync` lorsque votre application hôte n'est pas asynchrone :

```python
from qwen_code_sdk import is_sdk_result_message, query_sync


with query_sync(
    "Summarize this repository in one paragraph.",
    {
        "cwd": "/path/to/project",
        "path_to_qwen_executable": "qwen",
    },
) as result:
    for message in result:
        if is_sdk_result_message(message):
            if message.get("is_error"):
                error = message.get("error") or {}
                print(f"Error: {error.get('message', 'Unknown error')}")
            else:
                print(message.get("result", ""))
```

## Surface d'API

### Points d'entrée principaux

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` accepte :

- `str` pour les requêtes à un seul tour
- `AsyncIterable[SDKUserMessage]` pour les flux multi-tours

### `Query`

- Itérateur asynchrone sur les messages SDK
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Option                     | Type / valeurs                                              | Description                                                                                                     |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                       | Répertoire de travail pour le processus CLI.                                                                    |
| `model`                    | `str`                                                       | Remplacement du modèle pour cette session SDK.                                                                  |
| `path_to_qwen_executable`  | `str`                                                       | `qwen`, un chemin binaire explicite ou un bundle CLI `.js`.                                                     |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                      | Mode d'approbation d'exécution des outils. `yolo` approuve automatiquement tous les outils ; à utiliser uniquement dans des environnements de confiance ou sandboxés. |
| `can_use_tool`             | rappel asynchrone                                           | Rappel de permission personnalisé pour les demandes d'outils.                                                   |
| `env`                      | `dict[str, str]`                                            | Variables d'environnement supplémentaires transmises au processus CLI.                                          |
| `system_prompt`            | `str`                                                       | Remplacement du prompt système.                                                                                 |
| `append_system_prompt`     | `str`                                                       | Ajout d'instructions supplémentaires au prompt système.                                                         |
| `debug`                    | `bool`                                                      | Redirection de stderr du CLI vers stderr lorsqu'aucun hook `stderr` n'existe.                                   |
| `max_session_turns`        | `int`                                                       | Nombre maximum de tours avant que le CLI ne termine la session.                                                 |
| `core_tools`               | `list[str]`                                                 | Restriction de l'ensemble d'outils disponibles.                                                                 |
| `exclude_tools`            | `list[str]`                                                 | Exclusion des outils correspondants.                                                                            |
| `allowed_tools`            | `list[str]`                                                 | Autorisation des outils correspondants sans approbation du rappel.                                              |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | Mode d'authentification transmis au CLI.                                                                        |
| `include_partial_messages` | `bool`                                                      | Émission d'événements partiels du flux assistant.                                                               |
| `resume`                   | chaîne UUID                                                 | Reprise d'un identifiant de session connu.                                                                      |
| `continue_session`         | `bool`                                                      | Poursuite de la dernière session CLI.                                                                           |
| `session_id`               | chaîne UUID                                                 | Démarrage ou corrélation d'une session avec un identifiant connu.                                               |
| `timeout`                  | mapping                                                     | Délais d'attente en secondes.                                                                                   |
| `stderr`                   | appelable                                                   | Réception des lignes stderr du CLI.                                                                             |

Utilisez un seul de `resume`, `continue_session` ou `session_id` dans une requête. Le SDK lève `ValidationError` si ces options de session sont combinées.

Non pris en charge en v1 :

- `mcp_servers`

### Configuration courante

```python
options = {
    "cwd": "/path/to/project",
    "path_to_qwen_executable": "qwen",
    "model": "qwen-plus",
    "permission_mode": "plan",
    "max_session_turns": 1,
    "env": {
        "OPENAI_MODEL": "qwen-plus",
    },
    "timeout": {
        "control_request": 60,
        "can_use_tool": 60,
        "stream_close": 60,
    },
}
```

Les valeurs de délai sont en secondes. `env` est fusionné par-dessus l'environnement du processus parent, vous n'avez donc besoin de passer que les variables qui doivent différer pour cette session SDK. Définissez les secrets tels que `OPENAI_API_KEY` dans l'environnement parent ou un gestionnaire de secrets plutôt que de les coder en dur dans le code source.

## Gestion des permissions

Lorsque le CLI émet une requête de contrôle `can_use_tool`, le SDK la transmet via `can_use_tool(tool_name, tool_input, context)`.

- Comportement par défaut : refuser
- Délai d'attente par défaut : 60 secondes, configurable avec `timeout.can_use_tool`
- Fallback en cas de délai : refuser
- Exceptions du rappel : converties en refus avec un message d'erreur
- Contexte du rappel : `cancel_event`, `suggestions`, et `blocked_path`
- Contrat du rappel : `can_use_tool` doit être asynchrone avec 3 arguments positionnels ; `stderr` doit accepter 1 argument chaîne positionnel

Exemple :

```python
import asyncio
from pathlib import Path

from qwen_code_sdk import is_sdk_result_message, query

PROJECT_ROOT = Path("/path/to/project").resolve()


def project_path(tool_name, tool_input):
    key = "path" if tool_name == "list_directory" else "file_path"
    raw_path = tool_input.get(key)
    if not isinstance(raw_path, str) or not raw_path:
        return None

    resolved = (PROJECT_ROOT / raw_path).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT)
    except ValueError:
        return None
    return resolved


async def can_use_tool(tool_name, tool_input, context):
    if tool_name in {"read_file", "list_directory", "write_file"}:
        resolved = project_path(tool_name, tool_input)
        if resolved is None:
            return {
                "behavior": "deny",
                "message": "Seuls les chemins locaux au projet sont autorisés",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Seuls les fichiers .md peuvent être écrits"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} n'est pas autorisé par cette application",
    }


async def main():
    async with query(
        "Mettez à jour README.md avec un résumé court.",
        {
            "cwd": str(PROJECT_ROOT),
            "path_to_qwen_executable": "qwen",
            "can_use_tool": can_use_tool,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Si vous ne passez pas `can_use_tool`, le SDK refuse les demandes de permission par défaut.

## Sessions multi-tours

Pour les sessions multi-tours, passez un itérateur asynchrone d'objets `SDKUserMessage` :

```python
import asyncio

from qwen_code_sdk import SDKUserMessage, is_sdk_result_message, query

SESSION_ID = "123e4567-e89b-12d3-a456-426614174000"


async def prompts():
    first: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Créez un résumé concis du projet.",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Listez également les fichiers de test.",
        },
        "parent_tool_use_id": None,
    }
    yield second


async def main():
    async with query(
        prompts(),
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
            "session_id": SESSION_ID,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Tous les messages dans l'itérateur asynchrone doivent être connus à l'avance. Le SDK les envoie séquentiellement au CLI mais ne peut pas réinjecter une réponse précédente dans le générateur. Si vous avez besoin d'un échange conversationnel, gérez chaque tour comme un appel `query()` séparé.

## Contrôles d'exécution

L'objet `Query` retourné peut contrôler le processus CLI en cours :

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Inspectez ce dépôt et expliquez la structure des tests.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        commands = await result.supported_commands()
        print(commands)

        await result.set_permission_mode("plan")
        await result.set_model("qwen-plus")

        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Utilisez `interrupt()` pour annuler l'opération en cours, `close()` pour nettoyer le processus sous-jacent et `get_session_id()` pour conserver un identifiant de session pour plus tard.

## Reprise de session

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Reprendre une session connue par son identifiant.
    async with query(
        "Continuer à partir de cette session.",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Pour continuer la dernière session à la place :

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Continuer la dernière session.",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`resume` est utile lorsque votre application stocke des identifiants de session. `continue_session` délègue la sélection de la dernière session au CLI.

## Modèle d'erreur

- `ValidationError` : options invalides, UUID invalides, combinaisons non prises en charge
- `ControlRequestTimeoutError` : la requête de contrôle (initialisation, interruption, etc.) a expiré
- `ProcessExitError` : le CLI s'est terminé avec un code non nul
- `AbortError` : la requête de contrôle ou la session a été annulée

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Dis bonjour", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Erreur : {error.get('message', 'Erreur inconnue')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"Options SDK invalides : {exc}")
except ProcessExitError as exc:
    print(f"qwen s'est terminé avec le code {exc.exit_code} : {exc}")
```

## Dépannage

Si le SDK ne parvient pas à démarrer le CLI :

- Vérifiez que `qwen --version` fonctionne dans l'environnement cible
- Passez `path_to_qwen_executable` si votre shell utilise `nvm`, `pyenv` ou une autre configuration PATH non standard
- Utilisez `debug=True` ou `stderr=print` pour afficher le stderr du CLI pendant le débogage

Si les appels de contrôle de session expirent :

- Vérifiez que la version cible de `qwen` prend en charge `--input-format stream-json`
- Augmentez `timeout.control_request`
- Vérifiez qu'aucun script wrapper n'absorbe stdout/stderr

## Intégration du dépôt

Commandes d'aide au niveau du dépôt :

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Test de fumée E2E réel

Pour une vérification réelle de l'exécution (processus `qwen` réel + appel de modèle réel), exécutez depuis la racine du dépôt. L'aide npm utilise `python3`, assurez-vous donc qu'il résout un interpréteur Python `>=3.10` :

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Ce script exécute :

- une requête asynchrone en un seul tour
- un flux de contrôle asynchrone (`supported_commands`, mises à jour du mode de permission)
- une requête synchrone `query_sync`

Il imprime du JSON et retourne un code non nul en cas d'échec.
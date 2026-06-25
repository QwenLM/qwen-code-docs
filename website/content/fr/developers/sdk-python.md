# SDK Python

## `qwen-code-sdk`

`qwen-code-sdk` est un SDK Python expérimental pour Qwen Code. La version 1 cible le protocole CLI `stream-json` existant et maintient la surface de transport réduite et testable.

## Périmètre

- Nom du paquet : `qwen-code-sdk`
- Chemin d'import : `qwen_code_sdk`
- Exigence d'exécution : Python `>=3.10`
- Dépendance CLI : l'exécutable externe `qwen` est requis en v1
- Périmètre du transport : transport par processus uniquement
- Non inclus dans v1 : transport ACP, serveurs MCP embarqués dans le SDK

## Installation

```bash
pip install qwen-code-sdk
```

Pour les versions préliminaires :

```bash
pip install --pre qwen-code-sdk
```

Si `qwen` n'est pas dans le `PATH`, transmettez explicitement `path_to_qwen_executable`.

Avant d'écrire du code SDK, assurez-vous que la CLI fonctionne dans le même shell :

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

`asyncio.run()` convient pour des scripts autonomes. Si votre application utilise déjà une boucle d'événements, comme Jupyter, FastAPI ou pytest-asyncio, appelez plutôt `await main()`.

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

## Surface API

### Points d'entrée principaux

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` accepte soit :

- `str` pour des requêtes en un seul tour
- `AsyncIterable[SDKUserMessage]` pour des flux multi-tours

### `Query`

- Itérable asynchrone sur les messages SDK
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Option                     | Type / valeurs                                                | Description                                                                                                                           |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                         | Répertoire de travail pour le processus CLI.                                                                                          |
| `model`                    | `str`                                                         | Surcharge du modèle pour cette session SDK.                                                                                           |
| `path_to_qwen_executable`  | `str`                                                         | `qwen`, un chemin explicite vers un binaire, ou un bundle CLI `.js`.                                                                  |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                     | Mode d'approbation de l'exécution des outils. `yolo` approuve automatiquement tous les outils ; à utiliser uniquement dans des environnements de confiance ou sandboxés. |
| `can_use_tool`             | callback asynchrone                                           | Callback de permission personnalisé pour les demandes d'outils.                                                                       |
| `env`                      | `dict[str, str]`                                              | Variables d'environnement supplémentaires transmises au processus CLI.                                                                |
| `system_prompt`            | `str`                                                         | Surcharge du prompt système.                                                                                                          |
| `append_system_prompt`     | `str`                                                         | Ajoute des instructions supplémentaires au prompt système.                                                                            |
| `debug`                    | `bool`                                                        | Redirige la sortie d'erreur de la CLI vers stderr en l'absence de hook `stderr`.                                                      |
| `max_session_turns`        | `int`                                                         | Nombre maximal de tours avant que la CLI ne termine la session.                                                                       |
| `core_tools`               | `list[str]`                                                   | Restreint l'ensemble des outils disponibles.                                                                                          |
| `exclude_tools`            | `list[str]`                                                   | Exclut les outils correspondants.                                                                                                     |
| `allowed_tools`            | `list[str]`                                                   | Autorise les outils correspondants sans approbation par callback.                                                                     |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | Mode d'authentification transmis à la CLI.                                                                                            |
| `include_partial_messages` | `bool`                                                        | Émet les événements partiels du flux de l'assistant.                                                                                  |
| `resume`                   | chaîne UUID                                                   | Reprend une session existante avec son identifiant.                                                                                   |
| `continue_session`         | `bool`                                                        | Continue la dernière session CLI.                                                                                                     |
| `session_id`               | chaîne UUID                                                   | Démarre ou associe une session avec un identifiant connu.                                                                             |
| `timeout`                  | mapping                                                       | Délais d'attente en secondes.                                                                                                         |
| `stderr`                   | callable                                                      | Récepteur des lignes stderr de la CLI.                                                                                                |
Utilisez un seul de ces paramètres dans une requête : `resume`, `continue_session` ou `session_id`. Le SDK lève une `ValidationError` si ces options de session sont combinées.

Non pris en charge dans v1 :

- `mcp_servers`

### Configuration commune

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

Les valeurs de timeout sont en secondes. `env` est fusionné avec l'environnement du processus parent, vous n'avez donc besoin de passer que les variables qui doivent différer pour cette session SDK. Définissez les secrets tels que `OPENAI_API_KEY` dans l'environnement parent ou dans un gestionnaire de secrets plutôt que de les coder en dur dans le source.

## Gestion des permissions

Lorsque le CLI émet une demande de contrôle `can_use_tool`, le SDK l'achemine via `can_use_tool(tool_name, tool_input, context)`.

- Comportement par défaut : refuser
- Timeout par défaut : 60 secondes, configurable avec `timeout.can_use_tool`
- Comportement en cas de timeout : refuser
- Exceptions dans le callback : converties en refus avec un message d'erreur
- Contexte du callback : `cancel_event`, `suggestions` et `blocked_path`
- Contrat du callback : `can_use_tool` doit être asynchrone avec 3 arguments positionnels ; `stderr` doit accepter 1 argument positionnel de type chaîne

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
                "message": "Only project-local paths are allowed",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Only .md files can be written"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} is not allowed by this application",
    }


async def main():
    async with query(
        "Update README.md with a short summary.",
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
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Si vous ne passez pas `can_use_tool`, le SDK refuse les demandes de permission par défaut.

## Sessions multi-tours

Pour les sessions multi-tours, passez un itérable asynchrone d'objets `SDKUserMessage` :

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
            "content": "Create a concise project summary.",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Also list the test files.",
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
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Tous les messages dans l'itérable asynchrone doivent être connus à l'avance. Le SDK les envoie séquentiellement au CLI, mais ne peut pas réinjecter une réponse précédente dans le générateur. Si vous avez besoin d'un échange conversationnel, gérez chaque tour comme un appel `query()` distinct.

## Contrôles d'exécution

L'objet `Query` retourné peut contrôler le processus CLI en cours :
```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Inspect this repository and explain the test layout.",
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

Utilisez `interrupt()` pour annuler l'opération en cours, `close()` pour nettoyer le processus sous-jacent, et `get_session_id()` pour conserver un identifiant de session pour une utilisation ultérieure.

## Reprise de session

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Reprendre une session connue par son identifiant.
    async with query(
        "Continuer depuis cette session.",
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

Pour reprendre la dernière session à la place :

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

`resume` est utile lorsque votre application stocke les identifiants de session. `continue_session` délègue la sélection de la dernière session à l'interface en ligne de commande.

## Modèle d'erreur

- `ValidationError` : options invalides, UUIDs invalides, combinaisons non prises en charge
- `ControlRequestTimeoutError` : initialisation, interruption ou autre requête de contrôle ayant expiré
- `ProcessExitError` : l'interface en ligne de commande s'est arrêtée avec un code non nul
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
    print(f"qwen s'est arrêté avec le code {exc.exit_code} : {exc}")
```

## Dépannage

Si le SDK ne parvient pas à lancer l'interface en ligne de commande :

- Vérifiez que `qwen --version` fonctionne dans l'environnement cible
- Passez `path_to_qwen_executable` si votre shell utilise `nvm`, `pyenv` ou une configuration PATH non standard
- Utilisez `debug=True` ou `stderr=print` pour afficher la sortie d'erreur de l'interface en ligne de commande lors du débogage

Si les appels de contrôle de session expirent :

- Vérifiez que la version cible de `qwen` prend en charge `--input-format stream-json`
- Augmentez `timeout.control_request`
- Vérifiez qu'aucun script d'encapsulation n'intercepte stdout/stderr

## Intégration dans le dépôt

Commandes d'aide au niveau du dépôt :

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Test réel de bout en bout

Pour une vérification réelle en environnement d'exécution (processus `qwen` réel + appel réel du modèle), exécutez à partir de la racine du dépôt. L'assistant npm utilise `python3`, assurez-vous donc qu'il pointe vers un interpréteur Python `>=3.10` :

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Ce script exécute :

- une requête asynchrone à un seul tour
- un flux de contrôle asynchrone (`supported_commands`, mises à jour du mode d'autorisation)
- une requête synchrone `query_sync`

Il affiche du JSON et retourne un code non nul en cas d'échec.

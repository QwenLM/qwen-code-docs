## Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` é um SDK Python experimental para o Qwen Code. A v1 tem como alvo o protocolo CLI `stream-json` existente e mantém a superfície de transporte pequena e testável.

## Escopo

- Nome do pacote: `qwen-code-sdk`
- Caminho de importação: `qwen_code_sdk`
- Requisito de runtime: Python `>=3.10`
- Dependência de CLI: o executável `qwen` externo é necessário na v1
- Escopo de transporte: apenas transporte de processo
- Não incluído na v1: transporte ACP, servidores MCP embutidos no SDK

## Instalação

```bash
pip install qwen-code-sdk
```

Para versões de pré-lançamento:

```bash
pip install --pre qwen-code-sdk
```

Se `qwen` não estiver no `PATH`, passe `path_to_qwen_executable` explicitamente.

Antes de escrever código do SDK, certifique-se de que a CLI funciona no mesmo shell:

```bash
qwen --version
```

## Início Rápido

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

`asyncio.run()` é apropriado para scripts independentes. Se sua aplicação já executa um event loop, como Jupyter, FastAPI ou pytest-asyncio, chame `await main()` em vez disso.

## Uso Síncrono

Use `query_sync` quando sua aplicação host não for assíncrona:

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

## Superfície da API

### Pontos de entrada principais

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` aceita:

- `str` para requisições de turno único
- `AsyncIterable[SDKUserMessage]` para streams multi-turno

### `Query`

- Iterável assíncrono sobre mensagens do SDK
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Opção                      | Tipo / valores                                               | Descrição                                                                                                            |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                        | Diretório de trabalho para o processo CLI.                                                                           |
| `model`                    | `str`                                                        | Substituição de modelo para esta sessão do SDK.                                                                      |
| `path_to_qwen_executable`  | `str`                                                        | `qwen`, um caminho explícito para o binário, ou um bundle CLI `.js`.                                                   |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                       | Modo de aprovação de execução de ferramentas. `yolo` aprova automaticamente todas as ferramentas; use apenas em ambientes confiáveis ou em sandbox. |
| `can_use_tool`             | callback assíncrono                                          | Callback de permissão personalizado para requisições de ferramentas.                                                                |
| `env`                      | `dict[str, str]`                                             | Variáveis de ambiente extras passadas para o processo CLI.                                                                           |
| `system_prompt`            | `str`                                                        | Substitui o prompt do sistema.                                                                                                 |
| `append_system_prompt`     | `str`                                                        | Adiciona instruções extras ao prompt do sistema.                                                                 |
| `debug`                    | `bool`                                                       | Encaminha o stderr da CLI para stderr quando não há hook de `stderr`.                                                      |
| `max_session_turns`        | `int`                                                        | Número máximo de turnos antes da CLI encerrar a sessão.                                                                  |
| `core_tools`               | `list[str]`                                                  | Restringe o conjunto de ferramentas disponíveis.                                                                                |
| `exclude_tools`            | `list[str]`                                                  | Exclui ferramentas correspondentes.                                                                                         |
| `allowed_tools`            | `list[str]`                                                  | Permite ferramentas correspondentes sem aprovação do callback.                                                                 |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | Modo de autenticação passado para a CLI.                                                                          |
| `include_partial_messages` | `bool`                                                       | Emite eventos parciais de stream do assistente.                                                                           |
| `resume`                   | string UUID                                                  | Retoma uma sessão conhecida pelo ID.                                                                                      |
| `continue_session`         | `bool`                                                       | Continua a sessão CLI mais recente.                                                                                |
| `session_id`               | string UUID                                                  | Inicia ou correlaciona uma sessão com um ID conhecido.                                                                   |
| `timeout`                  | mapeamento                                                   | Timeouts em segundos.                                                                                            |
| `stderr`                   | callable                                                     | Recebe linhas do stderr da CLI.                                                                                      |

Use apenas um de `resume`, `continue_session` ou `session_id` em uma requisição. O SDK levanta `ValidationError` se essas opções de sessão forem combinadas.

Não suportado na v1:

- `mcp_servers`

### Configuração Comum

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

Os valores de timeout estão em segundos. `env` é mesclado sobre o ambiente do processo pai, então você só precisa passar variáveis que devem ser diferentes para esta sessão do SDK. Defina segredos como `OPENAI_API_KEY` no ambiente pai ou em um gerenciador de segredos, em vez de codificá-los no código-fonte.

## Tratamento de Permissões

Quando a CLI emite uma requisição de controle `can_use_tool`, o SDK a roteia através de `can_use_tool(tool_name, tool_input, context)`.

- Comportamento padrão: negar
- Timeout padrão: 60 segundos, configurável com `timeout.can_use_tool`
- Fallback de timeout: negar
- Exceções no callback: convertidas em negação com mensagem de erro
- Contexto do callback: `cancel_event`, `suggestions` e `blocked_path`
- Contrato do callback: `can_use_tool` deve ser assíncrono com 3 argumentos posicionais; `stderr` deve aceitar 1 argumento string posicional

Exemplo:

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
                "message": "Apenas caminhos locais ao projeto são permitidos",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Apenas arquivos .md podem ser escritos"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} não é permitido por esta aplicação",
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

Se você não passar `can_use_tool`, o SDK nega as requisições de permissão por padrão.

## Sessões Multi-Turno

Para sessões multi-turno, passe um iterável assíncrono de objetos `SDKUserMessage`:

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

Todas as mensagens no iterável assíncrono devem ser conhecidas antecipadamente. O SDK as envia sequencialmente para a CLI, mas não pode alimentar uma resposta anterior de volta ao gerador. Se você precisar de alternância de turnos conversacionais, gerencie cada turno como uma chamada separada de `query()`.

## Controles de Runtime

O objeto `Query` retornado pode controlar o processo CLI em execução:

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
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Use `interrupt()` para cancelar a operação atual, `close()` para limpar o processo subjacente e `get_session_id()` para persistir um ID de sessão para uso posterior.

## Retomada de Sessão

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Retoma uma sessão conhecida pelo seu ID.
    async with query(
        "Continue from this session.",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Para continuar a sessão mais recente:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Continue the latest session.",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`resume` é útil quando sua aplicação armazena IDs de sessão. `continue_session` delega a seleção da sessão mais recente para a CLI.

## Modelo de Erro

- `ValidationError`: opções inválidas, UUIDs inválidos, combinações não suportadas
- `ControlRequestTimeoutError`: requisição de controle (inicializar, interromper, etc.) expirou
- `ProcessExitError`: CLI saiu com código diferente de zero
- `AbortError`: requisição de controle ou sessão foi cancelada

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Say hello", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"Opções inválidas do SDK: {exc}")
except ProcessExitError as exc:
    print(f"qwen saiu com código {exc.exit_code}: {exc}")
```

## Solução de Problemas

Se o SDK não conseguir iniciar a CLI:

- Verifique se `qwen --version` funciona no ambiente de destino
- Passe `path_to_qwen_executable` se seu shell usar `nvm`, `pyenv` ou outra configuração não padrão de PATH
- Use `debug=True` ou `stderr=print` para exibir o stderr da CLI durante a depuração

Se as chamadas de controle de sessão expirarem:

- Verifique se a versão do `qwen` de destino suporta `--input-format stream-json`
- Aumente `timeout.control_request`
- Verifique se nenhum script wrapper está engolindo stdout/stderr

## Integração com o Repositório

Comandos auxiliares em nível de repositório:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Smoke E2E Real

Para uma verificação real de runtime (processo `qwen` real + chamada de modelo real), execute a partir da raiz do repositório. O helper npm usa `python3`, então certifique-se de que ele resolve para um interpretador Python `>=3.10`:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Este script executa:

- consulta assíncrona de turno único
- fluxo de controle assíncrono (`supported_commands`, atualizações de modo de permissão)
- consulta síncrona `query_sync`

Ele imprime JSON e retorna código diferente de zero em caso de falha.
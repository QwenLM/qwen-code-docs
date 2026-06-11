# Python SDK

## `qwen-code-sdk`

O `qwen-code-sdk` é um SDK Python experimental para o Qwen Code. A v1 tem como alvo o
protocolo CLI `stream-json` existente e mantém a superfície de transporte pequena e
testável.

## Escopo

- Nome do pacote: `qwen-code-sdk`
- Caminho de importação: `qwen_code_sdk`
- Requisito de runtime: Python `>=3.10`
- Dependência de CLI: o executável externo `qwen` é obrigatório na v1
- Escopo de transporte: apenas transporte por processo
- Não incluído na v1: transporte ACP, servidores MCP embutidos no SDK

## Instalação

```bash
pip install qwen-code-sdk
```

Se o `qwen` não estiver no `PATH`, passe `path_to_qwen_executable` explicitamente.

## Início Rápido

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

## Interface da API

### Pontos de entrada de nível superior

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

O `prompt` aceita:

- `str` para requisições de turno único
- `AsyncIterable[SDKUserMessage]` para streams de múltiplos turnos

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

Opções suportadas na v1:

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

A prioridade dos argumentos de sessão é fixa:

1. `resume`
2. `continue_session`
3. `session_id`

## Gerenciamento de Permissões

Quando a CLI emite uma requisição de controle `can_use_tool`, o SDK a roteia através de
`can_use_tool(tool_name, tool_input, context)`.

- Comportamento padrão: negar
- Timeout padrão: 60 segundos
- Fallback de timeout: negar
- Exceções no callback: convertidas em negação com uma mensagem de erro
- Contexto do callback: `cancel_event`, `suggestions` e `blocked_path`
- Contrato do callback: `can_use_tool` deve ser assíncrono com 3 argumentos posicionais;
  `stderr` deve aceitar 1 argumento posicional do tipo string

## Modelo de Erros

- `ValidationError`: opções inválidas, UUIDs inválidos, combinações não suportadas
- `ControlRequestTimeoutError`: requisição de controle de inicialização, interrupção ou outra requisição
  atingiu o timeout
- `ProcessExitError`: a CLI foi encerrada com código de saída diferente de zero
- `AbortError`: requisição de controle ou sessão foi cancelada

## Solução de Problemas

Se o SDK não conseguir iniciar a CLI:

- Verifique se `qwen --version` funciona no ambiente de destino
- Passe `path_to_qwen_executable` se seu shell usar `nvm`, `pyenv` ou outra
  configuração de `PATH` não padrão
- Use `debug=True` ou `stderr=print` para exibir o `stderr` da CLI durante a depuração

Se as chamadas de controle de sessão atingirem o timeout:

- Verifique se a versão de destino do `qwen` suporta `--input-format stream-json`
- Aumente `timeout.control_request`
- Verifique se nenhum script wrapper está suprimindo `stdout`/`stderr`

## Integração com o Repositório

Comandos auxiliares em nível de repositório:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Smoke Test E2E Real

Para uma verificação de runtime real (processo `qwen` real + chamada real ao modelo), execute a partir
da raiz do repositório. O helper npm usa `python3`, então certifique-se de que ele resolve para um
interpretador Python `>=3.10`:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Este script executa:

- query assíncrona de turno único
- fluxo de controle assíncrono (`supported_commands`, atualizações de modo de permissão)
- query síncrona `query_sync`

Ele imprime JSON e retorna um código diferente de zero em caso de falha.
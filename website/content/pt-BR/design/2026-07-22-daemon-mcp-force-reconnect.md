# Reconexão forçada de MCP do daemon

## Problema

`POST /workspace/mcp/reload` recarrega configurações persistidas, mas reconcilia
conexões MCP incrementalmente. Um servidor cujas configurações não mudaram
mantém seu transport existente. Credenciais OAuth escritas por outro processo do
Qwen Code, portanto, não são lidas até que esse transport se reconecte.

## Design

Adicionar os campos opcionais `forceReconnectAll` e `forceReconnectWhich` a
ambas as rotas de reload de MCP de workspace e aos seus métodos de bridge
SDK/ACP. `forceReconnectAll` tem como padrão `false`; `forceReconnectWhich`
seleciona servidores nomeados. Os campos são mutuamente exclusivos.

Quando qualquer opção de reconexão é fornecida, o daemon primeiro realiza a
reconciliação normal de configurações. Depois reconecta todo servidor MCP
configurado do workspace, ou apenas os nomes selecionados por
`forceReconnectWhich`:

- servidores em pool reiniciam pelo pool de transports do workspace uma vez por
  nome de servidor, depois renovam os snapshots de ferramentas do modelo para
  configurações ao vivo;
- servidores sem entrada de pool usam o caminho existente de descoberta por
  configuração, que desconecta e reconecta antes da redescoberta.

Isso deliberadamente não inicia OAuth. Apenas causa uma nova conexão, que lê as
credenciais atualmente persistidas pelo armazenamento de tokens do daemon.

## API

`POST /workspace/mcp/reload` e
`POST /workspaces/:workspace/mcp/reload` aceitam:

```json
{ "forceReconnectAll": true }
```

`forceReconnectWhich` aceita um array de nomes de servidor não vazios. Valores
inválidos retornam 400.
A resposta permanece `202 { "accepted": true }` porque o trabalho é
enfileirado.

## Verificação

- Testes de rota cobrem encaminhamento padrão, encaminhamento de `true` e
  entrada inválida.
- Testes do ACP cobrem propagação para cada configuração ao vivo e o
  comportamento de reconexão forçada.
- O plano de E2E documenta um cenário de token OAuth escrito externamente.

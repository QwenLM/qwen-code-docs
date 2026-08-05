# Contexto de invocação confiável do daemon

## Objetivo

Carregar identidade atestada pelo daemon para um prompt raiz aceito até
servidores MCP que o Qwen inicia via stdio. O contexto é um metadado de
correlação, não uma credencial de autorização.

O caminho completo de produção é:

```text
daemon prompt admission
  -> private ACP child
  -> root Session turn
  -> Qwen-launched stdio MCP tools/call request metadata
```

## Contrato de wire

O Qwen adiciona o seguinte valor a
`tools/call.params._meta["qwen-code/invocation"]`:

```ts
interface InvocationContextV1 {
  version: 1;
  sessionId: string;
  promptId: string;
  originatorClientId?: string;
}
```

- `sessionId` é a sessão ao vivo do daemon selecionada pela rota da
  requisição.
- `promptId` é fixado quando o daemon admite o prompt, antes de esperar na
  fila por sessão. Chamadores não bloqueantes podem fornecer o id de
  correlação usado pela correspondência existente de eventos terminais; caso
  contrário, o daemon gera um UUID. Em ambos os casos, o valor identifica o
  prompt que o daemon realmente admitiu, e não um metadado copiado do corpo
  do prompt.
- `originatorClientId`, quando presente, é o valor do cabeçalho da
  requisição depois que o daemon verifica que ele está registrado naquela
  sessão.
- Campos desconhecidos, versões desconhecidas e identificadores em branco
  são inválidos.

O daemon remove valores fornecidos pelo chamador para as chaves reservadas
de metadados e reconstrói o contexto a partir de seu próprio estado. Ele
passa o valor apenas ao filho ACP que iniciou e autenticou com uma
capability por processo. Chamadores ACP standalone não podem injetar o
contexto reservado.

## Tempo de vida e divulgação

A sessão ACP verifica que a sessão do contexto corresponde à sua sessão real
e a vincula ao prompt raiz com `AsyncLocalStorage`. Prompts concorrentes
permanecem isolados, inclusive quando compartilham um transporte MCP com
pool. Callbacks de confirmação adiada restauram explicitamente o contexto
capturado.

Turnos automáticos de cron, notificações de segundo plano, agentes em
segundo plano retomados e loops de raciocínio de subagente executam sem
contexto de invocação. O contexto não é persistido depois que o turno raiz
se liquida.

Apenas uma instância de transporte criada pelo Qwen como
`StdioClientTransport` a partir de uma configuração MCP `command` é marcada
como elegível. Transportes HTTP, SSE, WebSocket, reversos, fornecidos por
SDK e hospedados pelo cliente não recebem o metadado. O marcador de
elegibilidade segue a descoberta, clonagem, pooling, reconexão e retentativa
de ferramentas sem se tornar uma opção pública de configuração MCP.

## Não-objetivos

- Nenhum comportamento específico de Browser Use, opencode, backend
  local/remoto, página ou skill.
- Nenhuma enumeração de entrada ou grafo geral de proveniência.
- Nenhuma nova API do SDK TypeScript ou comportamento de ciclo de vida de
  MCP do qwen-serve.
- Nenhuma decisão de autorização baseada em `originatorClientId`.

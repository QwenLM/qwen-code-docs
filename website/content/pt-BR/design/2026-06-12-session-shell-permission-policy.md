# Política de Permissões do Shell de Sessão

## Problema

O endpoint `POST /session/:id/shell` executa um comando de shell diretamente através do daemon,
sem uma chamada de ferramenta LLM ou o fluxo normal de mediação de permissões do agente. Antes
desta alteração, o endpoint era uma mutação não estrita e podia ser acessado com um token do
daemon mais um ID de sessão, ou no padrão de loopback sem token para desenvolvedores.

Isso é autoridade demais para uma superfície de shell direta. Um chamador não deve ser
capaz de executar comandos de shell a menos que o operador do daemon habilite explicitamente
a superfície e o chamador prove que está vinculado à sessão de destino.

## Objetivos

- Desabilitar o shell direto de sessão por padrão.
- Exigir opt-in explícito do operador com `qwen serve --enable-session-shell`.
- Exigir configuração de bearer token antes que o opt-in se torne efetivo.
- Exigir um client id que esteja registrado na sessão endereçada.
- Aplicar a mesma política na rota REST, no dispatcher HTTP do ACP e no sink de execução da bridge.
- Manter as aprovações normais da ferramenta de shell do agente e a mediação de permissões inalteradas.

## Fora do Escopo

- Não rotear o shell direto através do `PermissionMediator`.
- Não alterar o envio de prompts, o enfileiramento de prompts ou o comportamento de prompt pendente do SDK.
- Não adicionar um rate limiter específico para shell.
- Não adicionar um alias de variável de ambiente para a flag de opt-in.

## Design

O `runQwenServe` resolve e faz o trim do bearer token uma única vez. Depois disso, ele computa
um booleano efetivo:

```ts
sessionShellCommandEnabled =
  opts.enableSessionShell === true && token !== undefined;
```

Esse valor é propagado para a bridge, o app REST e o dispatcher ACP. Chamadores incorporados que
invocam `createServeApp` diretamente computam a presença do token usando uma verificação de string
não vazia, de modo que `token: ''` se comporta como nenhum token tanto para o gate de mutação estrita
quanto para a propaganda de capacidade do shell.

A rota REST usa `mutate({ strict: true })`. Em um daemon de loopback sem token, o gate estrito
retorna `401 token_required` antes do handler ser executado. Quando um token é configurado, o
handler rejeita o shell desabilitado com `session_shell_disabled`, então exige `X-Qwen-Client-Id`,
valida o corpo do comando e, finalmente, delega para a bridge.

O dispatcher ACP mantém `_qwen/session/shell` como dispatchable para clientes antigos, mas
não o anuncia na lista `_qwen.methods` de inicialização, a menos que a política efetiva esteja
habilitada. Chamadas ACP desabilitadas retornam um erro JSON-RPC estável
`session_shell_disabled` sem registrar o comando em log ou chamar a bridge. Chamadas habilitadas
ainda exigem que a conexão seja proprietária da sessão e devem usar o client id de vinculação
de sessão carimbado pela bridge.

A bridge aplica a verificação final de defesa em profundidade em
`executeShellCommand()`: desabilitado, client id ausente, sessão desconhecida e, em seguida,
client id não vinculado. Somente após a aprovação nessas verificações é que ele publica eventos
de shell, executa o comando ou grava o histórico do shell.

## Contrato de Erro

REST:

- sem token: `401`, `code: token_required`
- desabilitado: `403`, `code/errorKind: session_shell_disabled`
- client id ausente: `403`, `code/errorKind: client_id_required`
- client id malformado ou não vinculado: `400 invalid_client_id` existente
- sessão desconhecida: mapeamento existente de `404 SessionNotFoundError`

ACP:

- desabilitado: `RPC.INVALID_REQUEST`, `data.errorKind: session_shell_disabled`
- client id de vinculação de sessão ausente: `RPC.INVALID_REQUEST`,
  `data.errorKind: client_id_required`
- sessão não proprietária e client id inválido mantêm os mapeamentos JSON-RPC existentes

## Compatibilidade

`DaemonSessionClient.shellCommand()` continua funcionando quando o daemon é
explicitamente habilitado e autenticado, porque o client de sessão carrega o
client id vinculado à sessão. O `DaemonClient.shellCommand(sessionId, command)` puro
deve passar `opts.clientId`, caso contrário, receberá `client_id_required`.

## Cobertura de Testes

A implementação é coberta por testes focados na bridge, REST, transporte ACP, boot do serve
e command-parser. As verificações de maior valor são o comportamento padrão desabilitado,
o gate estrito sem token, a propaganda de capacidade, a filtragem de métodos de inicialização
do ACP, a aplicação no sink da bridge e a propagação do client id vinculado à sessão.
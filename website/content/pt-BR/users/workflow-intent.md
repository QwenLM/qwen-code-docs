# Solicitar um workflow para um turno


Para uma preferência salva entre submissões ordinárias, consulte
[session Workflow mode](./workflow-mode.md).

Com `tools.workflowsEnabled` habilitado, inclua `ultracode` ou a palavra-chave
existente `workflow` em uma submissão humana para sugerir o uso da ferramenta
Workflow para esse turno. Por exemplo: `ultracode: audit these three modules`.
O modelo decide se um workflow se adequa à solicitação. A palavra-chave não
inicia um workflow, não altera permissões, não seleciona um modelo e não altera o esforço.

A entrada de terminal no Ink e OpenTUI, a entrada do compositor da IDE e a entrada
do compositor da Web Shell suportam este lembrete. Ele é adicionado à solicitação
do modelo separadamente da mensagem exibida. A próxima submissão ordinária não
o herda. Continuações de ferramenta e retentativas automáticas não o adicionam
novamente. Texto colado no compositor conta como entrada humana; expansões de
anexos e contexto adicionado por Hook não contam.

Histórico recuperado e colagens do registro do Ink Vim permanecem como entrada
desconhecida, incluindo após limpar o buffer ou desabilitar o Vim. Entrada fresca
no modo de inserção do Vim ainda pode ativar o lembrete.

`ultracode` ignora spans completos entre aspas/código e tokens semelhantes a
caminhos como `ultracode.js`, `x-ultracode` ou `ultracode/file`. A regra de
compatibilidade existente de `workflow` aceita palavras autônomas separadas por
espaços em branco com pontuação de borda, como `(workflow)`, mas não `workflows`
ou `my-workflow-runner`. Quando ambas as palavras-chave ocorrem, apenas um
lembrete é adicionado.

`qwen -p` simples, stdin simples, entrada agendada e prompts de string do SDK
não optam automaticamente. A entrada de streaming do SDK TypeScript pode
identificar explicitamente cada mensagem humana original:

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

Omita `origin` para contexto gerado por aplicação, automação, resultados de
ferramenta e replay de histórico. Uma origem ausente ou inválida mantém o chat
normal funcionando sem o lembrete de palavra-chave. A declaração não concede
permissões de ferramenta. Clientes ACP podem usar a declaração existente por
requisição `_meta['qwen.submittedPrompt']` para texto humano original; metadados
privados do daemon permanecem reservados.

Defina `ui.disableWorkflowKeywordTrigger` como `true` para desabilitar ambas as
palavras-chave nesses pontos de entrada. No diálogo de configurações do terminal,
isso é **Disable Workflow Keyword Trigger** e entra em vigor para novas submissões.
O lembrete também é omitido quando workflows ou a superfície de ferramenta
necessária estão indisponíveis. Uma sessão de workflow apenas com nome sugere
apenas workflows salvos com `{ name, args }`; não sugere escrever um script.

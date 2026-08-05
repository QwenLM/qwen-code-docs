# Eventos de preparação de chamada de ferramenta

## Contexto

O Qwen Code atualmente emite uma chamada de ferramenta apenas depois que o provider termina de fazer o streaming dos argumentos. Para ferramentas com entradas grandes ou complexas, gerar esses argumentos pode levar muito mais tempo do que executar a própria ferramenta. Os clientes ACP, portanto, não mostram nenhuma atividade durante a parte custosa e os usuários podem confundir o turno com uma requisição travada.

Os streams de provider já expõem identidade estável da ferramenta antes que os argumentos estejam completos:

- O Anthropic envia `id` e `name` em `content_block_start` para um bloco
  `tool_use`, e então envia fragmentos de argumentos como `input_json_delta`.
- Providers compatíveis com OpenAI normalmente enviam `id` e `function.name` no
  primeiro item de `choice.delta.tool_calls`, e então anexam fragmentos de argumentos.

O Qwen Code deliberadamente espera por `content_block_stop` ou `finish_reason`
antes de construir um `functionCall` compatível com Gemini. Essa propriedade de
segurança de execução deve permanecer inalterada.

## Objetivo

Permitir que clientes ACP renderizem um card de ferramenta enquanto o modelo ainda está preparando os argumentos da ferramenta, com este ciclo de vida:

```text
preparing -> in_progress -> completed | failed
```

O evento inicial contém apenas o ID estável da chamada de ferramenta e o nome da ferramenta. Ele nunca contém argumentos parciais e nunca inicia a execução da ferramenta.

## Escopo

Esta alteração suporta os dois caminhos de provider usados pelo cliente integrador:

- Respostas em streaming Anthropic e compatíveis com Anthropic.
- Respostas em streaming OpenAI e compatíveis com OpenAI.

Outros providers mantêm seu comportamento atual. Como o metadata de preparação é opcional, eles degradam naturalmente para o ciclo de vida existente `in_progress -> completed | failed`.

A alteração não modifica:

- verificações de permissão de ferramentas;
- ordenação de hooks;
- agendamento ou execução de ferramentas;
- histórico de conversa do modelo;
- construção de `functionCall` ou `functionResponse`;
- formatos de saída não-ACP.

## Design

### 1. Metadata interno de resposta

Associar metadata transitório de preparação de ferramenta a cada `GenerateContentResponse` através de um `WeakMap` local ao módulo:

```ts
interface ToolCallPreparation {
  callId: string;
  toolName: string;
}
```

Os adapters de provider armazenam esse metadata no chunk de resposta de nível superior. Ele não é uma propriedade enumerável da resposta nem um `Part` do Gemini, então não é serializado e a montagem de histórico do Gemini continua a ver apenas partes de texto, thought e `functionCall` completos. Helpers compartilhados fornecem operações tipadas de armazenamento e leitura, evitando casts específicos de provider no ACP.

### 2. Produtor Anthropic

Em `AnthropicContentGenerator.processStream()`, quando `content_block_start(tool_use)` contém `id` e `name` não vazios, emitir um chunk de resposta Gemini de outra forma vazio carregando uma entrada de preparação.

Continuar acumulando `input_json_delta` sem alterações. Em `content_block_stop`, emitir o `functionCall` completo existente com os argumentos parseados. Nenhum dado de argumento é exposto antes desse ponto.

### 3. Produtor compatível com OpenAI

Em `convertOpenAIChunkToGemini()`, observar cada item de `choice.delta.tool_calls` depois de passá-lo ao parser de chamadas de ferramenta local ao stream existente. Quando um ID e nome estáveis e não vazios estiverem disponíveis pela primeira vez, anexar uma entrada de preparação ao chunk de resposta atual.

Deduplicar por ID de chamada de ferramenta dentro do contexto da requisição. Continuar emitindo o `functionCall` completo apenas quando `finish_reason` estiver presente. Providers que não expõem ambos os campos de identidade precocemente simplesmente mantêm o comportamento existente.

### 4. Consumidor ACP e transições de estado

A `Session` do ACP lê o metadata de preparação antes de coletar os `functionCalls` completos. Para cada nova preparação, emite o frame `tool_call` padrão do ACP com:

```ts
{
  status: 'pending',
  rawInput: {},
  _meta: {
    phase: 'preparing',
    toolName,
    // metadata de proveniência existente permanece presente
  },
}
```

O caminho de execução existente posteriormente emite o mesmo `toolCallId` com `status: 'in_progress'` e os argumentos completos. A emissão de resultado existente então finaliza o card como `completed` ou `failed`.

O `TodoWrite` mantém seu tratamento especial atual e não emite um card de ferramenta. A emissão de preparação usa a mesma regra de filtragem, então não pode criar um card que o caminho de execução suprime intencionalmente.

### 5. Retry, fallback, cancelamento e falha de stream

Cada stream de modelo ACP ativo rastreia preparações até que o stream seja concluído e entregue suas chamadas parseadas à execução de ferramentas. Quando uma tentativa é abandonada por retry, fallback de modelo, cancelamento do usuário ou erro de stream, o ACP emite um `tool_call_update` terminal para cada entrada restante:

```ts
{
  status: 'failed',
  content: [],
  _meta: {
    phase: 'preparing',
    preparationDiscarded: true,
    toolName,
  },
}
```

`preparationDiscarded` significa que a tentativa do modelo foi abandonada antes que uma requisição de ferramenta parseada chegasse à execução. Não é uma falha de execução de ferramenta. O cliente integrador deve remover esse card transitório em vez de renderizar uma ferramenta falha. Usar um status terminal válido pelo protocolo garante que clientes mais antigos não retenham um card indefinidamente pendente.

`RETRY` agora limpa os `functionCalls` completos coletados da tentativa abandonada, correspondendo ao comportamento existente de `MODEL_FALLBACK` em todos os quatro caminhos de stream ACP. Isso impede que uma chamada parseada da tentativa falha seja executada junto com chamadas da tentativa substituta.

Quando um `functionCall` completo com o mesmo ID chega e o stream termina normalmente, o ACP o entrega ao caminho de execução existente sem um update de descarte. Se o stream falhar depois de parsear a chamada, mas antes da execução, a preparação ainda é descartada. Erros normais de ferramenta, portanto, continuam pelo caminho de resultado existente e nunca são marcados como descartados.

## Impacto downstream

- `GeminiChat` e os construtores de histórico ignoram o metadata opcional de nível superior e continuam persistindo apenas o conteúdo candidato.
- Uma resposta contendo apenas metadata de preparação não é contada como saída visível ao usuário, então retry de transporte e fallback de modelo mantêm seu comportamento existente pré-saída.
- IDs de preparação usam a mesma normalização entre turnos que os IDs de `functionCall` completos, preservando a correlação de updates do ACP quando um provider reutiliza um ID do histórico.
- O `Turn` do core, a TUI e consumidores JSON não interativos mantêm seu comportamento atual porque nenhum novo `Part` do Gemini ou evento de servidor é introduzido.
- O ACP é o único consumidor que opta pelo metadata e emite o estado inicial de UI.
- O mesmo contrato de metadata é compartilhado pelos adapters Anthropic e compatíveis com OpenAI, então o ACP não tem ramificações específicas de provider.

## Plano de testes

### Testes de provider do core

- Anthropic: um `content_block_start(tool_use)` produz metadata de preparação antes de qualquer `input_json_delta` e antes do `functionCall` final.
- Anthropic: ID ou nome ausente não emite metadata de preparação.
- Compatível com OpenAI: o primeiro delta com ID e nome estáveis emite uma entrada de preparação; deltas de argumentos posteriores não a duplicam.
- Compatível com OpenAI: chamadas completas ainda aparecem apenas em `finish_reason`, com argumentos parseados inalterados.
- Compatível com OpenAI: campos de identidade iniciais ausentes fazem fallback para o comportamento atual sem um evento de preparação inválido.
- GeminiChat: chunks de apenas preparação não suprimem retry de transporte, fallback de modelo primário ou continuação através de uma cadeia de fallback multi-modelo.
- GeminiChat: IDs de provider duplicados entre turnos são normalizados consistentemente no metadata de preparação e nas chamadas completas.

### Testes de ACP

- O metadata de preparação emite `pending` com `_meta.phase = 'preparing'` e nenhuma entrada parcial.
- A chamada completa reutiliza o mesmo ID e transiciona para `in_progress` com argumentos completos.
- Retry, fallback, cancelamento e erro de stream descartam preparações que não chegaram à execução de ferramentas com `_meta.preparationDiscarded = true`.
- Retry e fallback de modelo limpam chamadas completas coletadas da tentativa abandonada antes de aceitar chunks substitutos.
- Uma preparação que se tornou uma chamada completa não é descartada após um stream concluído normalmente, mas é descartada se esse stream falhar antes da execução.
- `TodoWrite` permanece suprimido.

### Verificação de regressão

Executar as suítes focadas de provider e ACP a partir dos diretórios de seus pacotes e, em seguida, executar build, typecheck e lint do repositório antes de concluir. A implementação com rebase no v0.19.9 foi verificada com:

- Suítes de provider e stream do core: 649 passaram.
- Suítes de ciclo de vida ACP: 316 passaram.
- Build do repositório, typecheck do workspace e lint completo: passaram.
- Verificações de Prettier e diff em arquivos alterados: passaram.

## Critérios de aceitação

1. Turnos ACP Anthropic e compatíveis com OpenAI emitem um card de ferramenta pendente assim que a identidade estável da ferramenta estiver disponível.
2. Nenhuma ferramenta inicia antes dos argumentos completos e dos caminhos existentes de permissão e execução.
3. Chamadas completas e resultados retêm seus IDs, argumentos, ordenação e representação de histórico atuais.
4. Tentativas abandonadas não deixam nenhum card de preparação indefinidamente pendente.
5. Providers sem metadata de preparação se comportam exatamente como antes.

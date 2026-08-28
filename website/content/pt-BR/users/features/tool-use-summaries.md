# Resumos de Uso de Ferramentas

O Qwen Code pode gerar um rótulo curto, no estilo de assunto de commit git, após cada lote de ferramentas ser concluído, resumindo o que foi realizado. O rótulo aparece inline: para um grupo de ferramentas concluído na visualização principal, ele substitui o cabeçalho genérico `Tool × N`; quando o grupo é forçado a expandir (no modo de detalhes expandidos com `Ctrl+O`, ou para lotes de erro / iniciados pelo usuário), ele aparece como uma linha escurecida `● <rótulo>` abaixo do grupo.

Isso é um auxílio de UX para chamadas paralelas de ferramentas: quando o modelo se ramifica em várias chamadas `Read` + `Grep` + `Bash` de uma só vez, o resumo mostra a intenção de relance, em vez de forçá-lo a escanear a lista de ferramentas.

O recurso está habilitado por padrão e é executado silenciosamente em segundo plano. Ele requer um [modelo rápido](./followup-suggestions#fast-model) configurado.

## O que Você Vê

### Visualização principal (grupo concluído)

Na transcrição principal, um lote completado e recolhível se dobra em uma única linha rotulada — o resumo substitui o cabeçalho genérico `Tool × N`:

```
╭──────────────────────────────────────────────╮
│✓  Read 4 text files                          │
╰──────────────────────────────────────────────╯
```

A saída completa por ferramenta está a uma tecla de distância: pressione `Ctrl+O` para alternar o modo de detalhes expandidos.

### Modo de detalhes expandidos (`Ctrl+O`) e grupos forçados a expandir

Quando um grupo é forçado a expandir — no modo de detalhes expandidos com `Ctrl+O`, ou para lotes de erro / iniciados pelo usuário na visualização principal — cada ferramenta é renderizada individualmente e o resumo aparece como uma linha de selo escurecida abaixo do grupo:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

## Como Funciona

Após um lote de ferramentas ser finalizado, o Qwen Code dispara uma chamada do tipo fire-and-forget para o modelo rápido configurado com:

- Os nomes das ferramentas, argumentos truncados e resultados truncados (cada um limitado a 300 caracteres).
- A saída de texto mais recente do assistente (primeiros 200 caracteres) como um prefixo de intenção.
- Um prompt de sistema instruindo o modelo a retornar um rótulo no passado, com 30 caracteres, no estilo de assunto de commit git.

A chamada é executada em paralelo com o streaming da API do próximo turno, então sua latência de ~1s fica oculta atrás da resposta do modelo principal. Quando o rótulo é resolvido, ele é anexado à transcrição como uma entrada `tool_use_summary`.

Exemplos de rótulos: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Quando Aparece

O resumo é gerado quando **todas** as condições a seguir são verdadeiras:

- `experimental.emitToolUseSummaries` é `true` (padrão).
- Um `fastModel` está configurado (via configurações ou `/model --fast`).
- Pelo menos uma ferramenta foi concluída no lote.
- O turno não foi abortado antes da conclusão da ferramenta.
- O modelo rápido retornou uma resposta não vazia e sem erros.

Chamadas de ferramentas de subagentes não disparam a geração de resumo — apenas os lotes de ferramentas da sessão principal o fazem.

## Quando Não Aparece

O resumo é silenciosamente ignorado (sem erro, sem alteração na interface) quando:

- Nenhum modelo rápido está configurado.
- A chamada do modelo rápido falha, expira ou retorna vazia.
- O modelo retornou uma string com aparência de mensagem de erro (ex.: `Error: ...`, `I cannot ...`) — filtrada pelo cliente para que a interface não mostre rótulos enganosos.
- O turno foi abortado (`Ctrl+C`) antes da conclusão do modelo.

Em todos esses casos, o grupo de ferramentas é renderizado como sempre foi.

## Modelo Rápido

O rótulo é gerado usando o [modelo rápido](./followup-suggestions#fast-model) — o mesmo modelo configurado para sugestões de prompt e execução especulativa. Configure-o via:

### Via comando

```
/model --fast qwen3-coder-flash
```

### Via `settings.json`

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Quando nenhum modelo rápido está configurado, a geração de resumo é totalmente ignorada — o recurso não tem efeito até que você configure um.

## Configuração

Estas configurações podem ser definidas em `settings.json`:

| Configuração                       | Tipo    | Padrão | Descrição                                                                                         |
| ---------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries`| boolean | `true` | Chave mestre para geração de resumos. Desative para desabilitar a chamada extra do modelo rápido. |
| `fastModel`                        | string  | `""`   | Modelo rápido usado para geração de resumos (compartilhado com sugestões de prompt). Obrigatório; inoperante se vazio. |

### Sobrescrita de ambiente

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` sobrescreve a configuração `experimental.emitToolUseSummaries` para a sessão atual:

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` ou `=false` — força desligado.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` ou `=true` — força ligado.
- Não definido — usa a configuração `experimental.emitToolUseSummaries`.

### Exemplo

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## Escopo e ciclo de vida

Três pontos que costumam confundir em uma primeira leitura deste recurso:

1. **Uma geração por lote, compartilhada por ambos os modos de exibição.** A chamada ao modelo rápido ocorre exatamente uma vez em `handleCompletedTools` quando um lote de ferramentas é finalizado. Alternar com `Ctrl+O` depois disso **não** dispara uma nova chamada — ambos os modos, o recolhido e o expandido, leem da mesma entrada de histórico `tool_use_summary` capturada na primeira vez.
2. **Sem preenchimento retroativo ao alternar ou ao retomar sessão.** Um `tool_group` que foi concluído antes de o recurso ser ativado (ou antes de você ativar a configuração, ou em uma sessão retomada — o `ChatRecordingService` não persiste entradas de resumo) nunca receberá um rótulo. Não há uma varredura de histórico existente. Se você ativar esta configuração no meio de uma sessão, apenas lotes **futuros** mostrarão um rótulo; grupos mais antigos mantêm a renderização padrão sem indicador de que um rótulo está faltando.
3. **Apenas lotes do agente principal.** O gatilho reside no loop de turnos da sessão principal (`useLlmStream`), então:
   - ✅ Shell, MCP, operações de arquivo e a própria _chamada_ da ferramenta `Task` / subagente (conforme aparece no lote principal) são resumidos.
   - ❌ Os lotes de ferramentas **internos** de um subagente (executados por meio de `packages/core/src/agents/runtime/`) **não** são resumidos.

   Um lote externo que _contém_ uma ferramenta `Task` ainda será rotulado, mas o modelo rápido vê apenas a chamada da ferramenta subagente e sua saída agregada — não as chamadas individuais dentro do subagente. Espere rótulos como `Ran research-agent` ou `Delegated file search` em vez de `Searched 14 files`. Isso é intencional — resumir os internos do subagente multiplicaria o custo do modelo rápido e traria ruído que nunca aparece na interface primária.

## Comportamento de exibição

A visualização principal já dobra um lote completado e recolhível em uma única linha rotulada (`✓  Read 4 text files`) — o resumo faz o trabalho da antiga lista por ferramenta. Para detalhes completos por ferramenta, pressione `Ctrl+O` para alternar o modo de detalhes expandidos, onde cada ferramenta é renderizada individualmente com o resumo como uma linha final `● <rótulo>` abaixo do grupo.

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

Para lotes pequenos do mesmo tipo (ex.: `Read × 3`), a linha `● <rótulo>` expandida pode parecer uma repetição das linhas de ferramentas visíveis; se isso corresponde ao seu fluxo de trabalho usual, você pode desativar o resumo completamente via `experimental.emitToolUseSummaries: false`.

## Monitoramento

O uso do modelo de resumo aparece na saída de `/stats` sob os totais de tokens do modelo rápido, com o `prompt_id` `tool_use_summary_generation` para que possa ser distinguido das sugestões de prompt e outras tarefas em segundo plano.

## Fluxo de dados e privacidade

A chamada de resumo envia o nome, `args` truncado e resultado truncado de cada ferramenta bem-sucedida (cada campo limitado a 300 caracteres) para o **modelo rápido**, além dos primeiros 200 caracteres do texto mais recente do assistente como um prefixo de intenção.

Se o seu modelo rápido estiver configurado para o mesmo provedor/auth que o modelo da sessão principal, os dados fluem pelos mesmos limites que sua sessão principal já usa — sem alteração no escopo de confiança. Se você configurou um modelo rápido de um **provedor diferente**, as entradas e saídas das ferramentas (potencialmente incluindo conteúdos de arquivos lidos por `read_file`, saídas de comandos de chamadas shell ou valores expostos por ferramentas MCP) serão enviadas a esse outro provedor como parte do prompt de resumo. Isso é um escopo de compartilhamento de dados estritamente maior do que apenas a sessão principal.

Se isso for relevante para seu fluxo de trabalho, você tem duas opções claras:

- Configure `fastModel` para um modelo sob o mesmo provedor da sessão principal, para que a chamada de resumo não cruze nenhum novo limite de auth/dados.
- Desative o recurso completamente com `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

O limite de 300 caracteres por campo reduz a exposição, mas não a elimina — segredos descobertos na saída das ferramentas durante a janela de limite ainda podem ser enviados. Trate o limite de dados do modelo rápido da mesma forma que trata o do modelo principal.

## Custo

Uma chamada ao modelo rápido por lote qualificado. A entrada é um pequeno prompt de sistema fixo mais as entradas/saídas truncadas das ferramentas (cada campo limitado a 300 caracteres). A saída é uma única linha curta (limitada a 100 caracteres, tipicamente 20 tokens ou menos). Em um modelo rápido típico, isso custa aproximadamente $0,001 por lote.

Se você não quiser o custo extra, desative o recurso via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Relacionados

- [Modo de detalhes expandidos](../configuration/settings#ui) — pressione `Ctrl+O` para expandir todas as saídas de ferramentas inline; o resumo substitui o cabeçalho genérico do grupo de ferramentas para grupos concluídos na visualização principal.
- [Sugestões de Acompanhamento](./followup-suggestions) — outro aprimoramento de UX acionado pelo modelo rápido que compartilha a mesma configuração `fastModel`.
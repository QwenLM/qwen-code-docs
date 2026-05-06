# Resumos de Uso de Ferramentas

O Qwen Code pode gerar um rótulo curto, no estilo de assunto de commit do Git, após a conclusão de cada lote de ferramentas, resumindo o que o lote realizou. O rótulo aparece inline no transcript e substitui o cabeçalho genérico `Tool × N` no modo compacto.

Este é um recurso de UX para chamadas de ferramentas paralelas: quando o modelo dispara várias chamadas `Read` + `Grep` + `Bash` ao mesmo tempo, o resumo informa a intenção de relance, em vez de forçar você a percorrer a lista de ferramentas.

O recurso está ativado por padrão e é executado silenciosamente em segundo plano. Ele requer um [modelo rápido](./followup-suggestions#fast-model) configurado.

## O que você vê

### Modo completo (padrão)

O resumo aparece como uma linha de badge esmaecida diretamente abaixo do grupo de ferramentas:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

### Modo compacto (`Ctrl+O` ou `ui.compactMode: true`)

O rótulo substitui o cabeçalho genérico `Tool × N` na linha única do modo compacto:

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

As chamadas individuais de ferramentas continuam a apenas um atalho de teclado de distância (`Ctrl+O` para alternar para o modo completo).

## Como funciona

Após a finalização de um lote de ferramentas, o Qwen Code dispara uma chamada fire-and-forget para o modelo rápido configurado com:

- Os nomes das ferramentas, argumentos truncados e resultados truncados (cada um limitado a 300 caracteres).
- A saída de texto mais recente do assistente (primeiros 200 caracteres) como um prefixo de intenção.
- Um prompt de sistema instruindo o modelo a retornar um rótulo no passado, com até 30 caracteres, no estilo de assunto de commit do Git.

A chamada é executada em paralelo com o streaming da API da próxima interação, portanto sua latência de ~1s fica oculta atrás da resposta do modelo principal. Quando o rótulo é resolvido, ele é anexado ao transcript como uma entrada `tool_use_summary`.

Exemplos de rótulos: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Quando aparece

O resumo é gerado quando **todas** as seguintes condições são verdadeiras:

- `experimental.emitToolUseSummaries` está definido como `true` (padrão).
- Um `fastModel` está configurado (via configurações ou `/model --fast`).
- Pelo menos uma ferramenta foi concluída no lote.
- A interação não foi abortada antes da conclusão da ferramenta.
- O modelo rápido retornou uma resposta não vazia e sem erros.

Chamadas de ferramentas de subagentes não acionam a geração de resumos — apenas os lotes de ferramentas da sessão principal o fazem.

## Quando não aparece

O resumo é ignorado silenciosamente (sem erro, sem alteração na UI) quando:

- Nenhum modelo rápido está configurado.
- A chamada ao modelo rápido falha, atinge o timeout ou retorna vazia.
- O modelo retornou uma string óbvia semelhante a uma mensagem de erro (ex.: `Error: ...`, `I cannot ...`) — filtrada pelo cliente para que a UI não exiba rótulos enganosos.
- A interação foi abortada (`Ctrl+C`) antes que o modelo concluísse.

Em todos esses casos, o grupo de ferramentas é renderizado como sempre foi.

## Modelo rápido

O rótulo é gerado usando o [modelo rápido](./followup-suggestions#fast-model) — o mesmo modelo que você configura para sugestões de prompt e execução especulativa. Configure-o via:

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

Quando nenhum modelo rápido está configurado, a geração de resumos é completamente ignorada — o recurso não tem efeito até que você configure um.

## Configuração

Essas configurações podem ser definidas no `settings.json`:

| Configuração                          | Tipo    | Padrão  | Descrição                                                                                          |
| ------------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries`   | boolean | `true`  | Chave mestra para geração de resumos. Desative para desabilitar a chamada extra ao modelo rápido.  |
| `fastModel`                           | string  | `""`    | Modelo rápido usado para geração de resumos (compartilhado com sugestões de prompt). Obrigatório; sem efeito se vazio. |

### Substituição por variável de ambiente

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` substitui a configuração `experimental.emitToolUseSummaries` para a sessão atual:

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` ou `=false` — força desativado.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` ou `=true` — força ativado.
- Não definida — usa a configuração `experimental.emitToolUseSummaries`.

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

Três pontos que costumam causar confusão na primeira leitura deste recurso:

1. **Uma geração por lote, compartilhada por ambos os modos de exibição.** A chamada ao modelo rápido ocorre exatamente uma vez em `handleCompletedTools` quando um lote de ferramentas é finalizado. Alternar `Ctrl+O` depois disso **não** aciona uma nova chamada — ambos os modos leem a mesma entrada de histórico `tool_use_summary` capturada na primeira vez. Você pode ativar e desativar o modo compacto livremente sem custo adicional.
2. **Sem preenchimento retroativo ao alternar ou retomar a sessão.** Um `tool_group` concluído antes do recurso ser ativado (ou antes de você ativar a configuração, ou em uma sessão retomada — o `ChatRecordingService` não persiste entradas de resumo) nunca receberá um rótulo. Não há uma passagem de "varredura do histórico existente". Se você ativar essa configuração no meio da sessão, apenas os lotes _futuros_ exibirão um rótulo; os grupos mais antigos mantêm a renderização padrão, sem nenhum indicador de que um rótulo está faltando.
3. **Apenas lotes do agente principal.** O gatilho reside no loop de interação da sessão principal (`useGeminiStream`), portanto:
   - ✅ Shell, MCP, operações de arquivo e a própria _chamada_ da ferramenta `Task` / subagente (conforme aparece no lote principal) são resumidas.
   - ❌ Lotes de ferramentas **internos** de um subagente (executados via `packages/core/src/agents/runtime/`) não são resumidos.

   Um lote externo que _contém_ uma ferramenta `Task` ainda será rotulado, mas o modelo rápido vê apenas a chamada da ferramenta do subagente e sua saída agregada — não as chamadas individuais de ferramentas dentro do subagente. Espere rótulos como `Ran research-agent` ou `Delegated file search` em vez de `Searched 14 files`. Isso é intencional — resumir os internos do subagente multiplicaria o custo do modelo rápido e traria ruído que nunca aparece na UI principal.

## Combinação recomendada: ativar o modo compacto

Para lotes com 3 ou mais chamadas de ferramentas paralelas, combinar este recurso com `ui.compactMode: true` produz o transcript mais limpo. A visualização compacta agrupa todo o lote em uma única linha rotulada (`✓  Read txt files  · 4 tools`) em vez de mostrar cada linha de ferramenta mais o resumo final. Os detalhes continuam a apenas um atalho de teclado de distância via `Ctrl+O`.

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "compactMode": true
  },
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

No modo completo (padrão), o resumo é renderizado como uma linha final `● <label>` abaixo do grupo de ferramentas — útil para lotes grandes ou heterogêneos, mas para lotes pequenos do mesmo tipo (ex.: `Read × 3`) o rótulo pode parecer uma repetição das linhas de ferramentas visíveis. Se isso se alinha ao seu fluxo de trabalho usual, ative o modo compacto conforme acima ou desative o resumo completamente via `experimental.emitToolUseSummaries: false`.

## Monitoramento

O uso do modelo para resumos aparece na saída de `/stats` nos totais de tokens do modelo rápido, com o `prompt_id` `tool_use_summary_generation` para que possa ser distinguido de sugestões de prompt e outras tarefas em segundo plano.

## Fluxo de dados e privacidade

A chamada de resumo envia o nome de cada ferramenta bem-sucedida, `args` truncados e resultado truncado (cada campo limitado a 300 caracteres) para o **modelo rápido**, além dos primeiros 200 caracteres do texto mais recente do assistente como um prefixo de intenção.

Se o seu modelo rápido estiver configurado para o mesmo provedor/autenticação do modelo da sua sessão principal, os dados fluem pela mesma fronteira que sua sessão principal já utiliza — sem alteração no escopo de confiança. Se você configurou um modelo rápido de um **provedor diferente**, as entradas e saídas das ferramentas (potencialmente incluindo conteúdos de arquivos lidos por `read_file`, saída de comandos de chamadas de shell ou valores expostos por ferramentas MCP) serão enviadas a esse outro provedor como parte do prompt de sumarização. Esse é um escopo de compartilhamento de dados estritamente maior do que o da sessão principal isolada.

Se isso for relevante para o seu fluxo de trabalho, você tem duas opções claras:

- Configure `fastModel` para um modelo do mesmo provedor da sua sessão principal, para que a chamada de resumo não cruze nenhuma nova fronteira de autenticação/dados.
- Desative o recurso completamente com `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

O limite de 300 caracteres por campo reduz a exposição, mas não a elimina — segredos descobertos na saída da ferramenta durante a janela de corte ainda podem ser enviados. Trate a fronteira de dados do modelo rápido da mesma forma que você trata a do modelo principal.

## Custo

Uma chamada ao modelo rápido por lote de ferramentas qualificado. A entrada é um pequeno prompt de sistema fixo mais as entradas/saídas truncadas das ferramentas (cada uma limitada a 300 caracteres por campo). A saída é uma única linha curta (limitada a 100 caracteres, tipicamente 20 tokens ou menos). Em um modelo rápido típico, isso custa aproximadamente $0,001 por lote.

Se você não quiser o custo adicional, desative o recurso via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Relacionados

- [Modo Compacto](../configuration/settings#ui.compactMode) — alterne com `Ctrl+O`; o resumo substitui o cabeçalho genérico do grupo de ferramentas quando o modo compacto está ativado.
- [Sugestões de Acompanhamento](./followup-suggestions) — outro aprimoramento de UX impulsionado por modelo rápido que compartilha a mesma configuração `fastModel`.
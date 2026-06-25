# Resumos de Uso de Ferramentas

O Qwen Code pode gerar um rótulo curto no estilo *git-commit-subject* após cada lote de ferramentas, resumindo o que o lote realizou. O rótulo aparece embutido na transcrição e substitui o cabeçalho genérico `Tool × N` no modo compacto.

Isso é um auxílio de UX para chamadas paralelas de ferramentas: quando o modelo se expande em várias chamadas `Read` + `Grep` + `Bash` de uma só vez, o resumo mostra a intenção de relance, em vez de forçá-lo a escanear a lista de ferramentas.

A funcionalidade está ativada por padrão e funciona silenciosamente em segundo plano. Ela requer um [modelo rápido](./followup-suggestions#fast-model) configurado.

## O Que Você Vê

### Modo completo (padrão)

O resumo aparece como uma linha de *badge* esmaecida diretamente abaixo do grupo de ferramentas:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Leia 4 arquivos de texto
```

### Modo compacto (`Ctrl+O` ou `ui.compactMode: true`)

O rótulo substitui o cabeçalho genérico `Tool × N` na linha única compacta:

```
╭──────────────────────────────────────────────╮
│✓  Leia arquivos txt  · 4 ferramentas         │
│Pressione Ctrl+O para exibir saída completa   │
╰──────────────────────────────────────────────╯
```

As chamadas individuais das ferramentas ainda estão a um toque de tecla (`Ctrl+O` para alternar para o modo completo).

## Como Funciona

Após a finalização de um lote de ferramentas, o Qwen Code dispara uma chamada do tipo *fire-and-forget* para o modelo rápido configurado com:

- Os nomes das ferramentas, argumentos truncados e resultados truncados (cada um limitado a 300 caracteres).
- A saída de texto mais recente do assistente (primeiros 200 caracteres) como prefixo de intenção.
- Um prompt de sistema instruindo o modelo a retornar um rótulo no passado, com até 30 caracteres, no estilo *git-commit-subject*.

A chamada é executada em paralelo com o streaming da API da próxima rodada, de modo que sua latência de ~1s fica oculta atrás da resposta do modelo principal. Quando o rótulo é resolvido, ele é anexado à transcrição como uma entrada `tool_use_summary`.

Exemplos de rótulos: `Buscou em auth/`, `Corrigiu NPE no UserService`, `Criou endpoint de cadastro`, `Leu config.json`, `Executou testes com falha`.

## Quando Aparece

O resumo é gerado quando **todas** as condições a seguir são verdadeiras:

- `experimental.emitToolUseSummaries` é `true` (padrão).
- Um `fastModel` está configurado (via configurações ou `/model --fast`).
- Pelo menos uma ferramenta foi concluída no lote.
- A rodada não foi abortada antes da conclusão da ferramenta.
- O modelo rápido retornou uma resposta não vazia e sem erros.

Chamadas de ferramentas de subagente não disparam a geração de resumo — apenas os lotes de ferramentas da sessão principal.

## Quando Não Aparece

O resumo é silenciosamente ignorado (sem erro, sem alteração na interface) quando:

- Nenhum modelo rápido está configurado.
- A chamada do modelo rápido falha, expira ou retorna vazia.
- O modelo retornou uma string com aparência de mensagem de erro (ex.: `Error: ...`, `I cannot ...`) — filtrada pelo cliente para que a interface não exiba rótulos enganosos.
- A rodada foi abortada (`Ctrl+C`) antes de o modelo terminar.

Em todos esses casos, o grupo de ferramentas é exibido como sempre foi.

## Modelo Rápido

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

Quando nenhum modelo rápido está configurado, a geração de resumo é completamente ignorada — a funcionalidade não tem efeito até que você configure um.

## Configuração

Estas configurações podem ser definidas em `settings.json`:

| Configuração                        | Tipo    | Padrão  | Descrição                                                                                             |
| ----------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`  | Interruptor principal para geração de resumos. Desligue para desabilitar a chamada extra ao modelo rápido. |
| `fastModel`                         | string  | `""`    | Modelo rápido usado para geração de resumos (compartilhado com sugestões de prompt). Obrigatório; sem efeito se vazio. |

### Substituição por variável de ambiente

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

Três pontos que costumam causar dúvidas na primeira leitura desta funcionalidade:

1. **Uma geração por lote, compartilhada pelos dois modos de exibição.** A chamada ao modelo rápido acontece exatamente uma vez em `handleCompletedTools` quando um lote de ferramentas finaliza. Alternar `Ctrl+O` depois **não** dispara uma nova chamada — ambos os modos leem da mesma entrada de histórico `tool_use_summary` que foi capturada na primeira vez. Você pode alternar o modo compacto livremente sem custo extra.
2. **Sem preenchimento retroativo ao alternar ou ao retomar sessão.** Um `tool_group` que foi concluído antes de a funcionalidade ser ativada (ou antes de você ligar a configuração, ou em uma sessão retomada — o `ChatRecordingService` não persiste entradas de resumo) nunca receberá um rótulo. Não há uma passagem de "varredura do histórico existente". Se você ativar esta configuração no meio da sessão, apenas os lotes **futuros** mostrarão um rótulo; grupos mais antigos mantêm a renderização padrão, sem nenhum indicador de que um rótulo está faltando.
3. **Apenas lotes do agente principal.** O gatilho reside no loop de rodadas da sessão principal (`useGeminiStream`), portanto:
   - ✅ Chamadas de Shell, MCP, operações de arquivo e a **própria chamada** da ferramenta `Task`/subagente (como aparece no lote principal) são resumidas.
   - ❌ Os lotes de ferramentas **internos** de um subagente (executados através de `packages/core/src/agents/runtime/`) **não** são resumidos.
Um lote externo que _contém_ uma ferramenta `Task` ainda será rotulado, mas o modelo rápido vê apenas a chamada de ferramenta do subagente e sua saída agregada — não as chamadas individuais de ferramentas dentro do subagente. Espere rótulos como `Executou research-agent` ou `Delegou busca em arquivos` em vez de `Pesquisou 14 arquivos`. Isso é intencional — resumir os detalhes internos do subagente multiplicaria o custo do modelo rápido e traria ruído que nunca aparece na interface primária.

## Combinação recomendada: ativar modo compacto

Para lotes com 3 ou mais chamadas de ferramenta em paralelo, combinar esse recurso com `ui.compactMode: true` produz a transcrição mais limpa. A visualização compacta agrupa todo o lote em uma única linha rotulada (`✓  Leu arquivos txt  · 4 ferramentas`) em vez de mostrar cada linha de ferramenta mais o resumo final. Os detalhes permanecem a uma tecla de distância via `Ctrl+O`.

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

No modo completo (padrão), o resumo é exibido como uma linha `● <rótulo>` abaixo do grupo de ferramentas — útil para lotes grandes ou heterogêneos, mas para pequenos lotes do mesmo tipo (ex.: `Leitura × 3`) o rótulo pode soar como uma repetição das linhas de ferramenta visíveis. Se isso se adequa ao seu fluxo de trabalho habitual, ative o modo compacto como acima ou desative o resumo completamente com `experimental.emitToolUseSummaries: false`.

## Monitoramento

O uso do modelo de resumo aparece na saída de `/stats` sob os totais de tokens do modelo rápido, com `prompt_id` igual a `tool_use_summary_generation` para que possa ser distinguido de sugestões de prompt e outras tarefas em segundo plano.

## Fluxo de dados e privacidade

A chamada de resumo envia o nome de cada ferramenta bem-sucedida, `args` truncados e resultado truncado (cada campo limitado a 300 caracteres) para o **modelo rápido**, além dos primeiros 200 caracteres do texto mais recente do assistente como prefixo de intenção.

Se o seu modelo rápido está configurado para o mesmo provedor/autenticação que o modelo principal da sessão, os dados fluem pelos mesmos limites que sua sessão principal já usa — sem alteração no escopo de confiança. Se você configurou um modelo rápido de um **provedor diferente**, as entradas e saídas das ferramentas (potencialmente incluindo conteúdos de arquivos lidos por `read_file`, saídas de comandos de chamadas shell ou valores expostos por ferramentas MCP) serão enviadas para esse outro provedor como parte do prompt de sumarização. Isso representa um escopo de compartilhamento de dados estritamente maior do que apenas a sessão principal.

Se isso for relevante para seu fluxo de trabalho, você tem duas opções claras:

- Configure `fastModel` para um modelo sob o mesmo provedor da sua sessão principal, para que a chamada de resumo não ultrapasse nenhum novo limite de autenticação/dados.
- Desative o recurso completamente com `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

O limite de 300 caracteres por campo restringe a exposição, mas não a elimina — segredos descobertos na saída da ferramenta durante essa janela de limite ainda podem ser enviados. Trate o limite de dados do modelo rápido da mesma forma que trata o limite do modelo principal.

## Custo

Uma chamada ao modelo rápido por lote de ferramentas qualificado. A entrada consiste em um prompt de sistema pequeno e fixo mais as entradas/saídas truncadas das ferramentas (cada campo limitado a 300 caracteres). A saída é uma única linha curta (limitada a 100 caracteres, tipicamente 20 tokens ou menos). Em um modelo rápido típico, isso custa aproximadamente $0.001 por lote.

Se você não quiser o custo extra, desative o recurso via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Relacionados

- [Modo Compacto](../configuration/settings#ui) — alternar com `Ctrl+O`; o resumo substitui o cabeçalho genérico do grupo de ferramentas quando o modo compacto está ativado.
- [Sugestões de Acompanhamento](./followup-suggestions) — outra melhoria de UX orientada por modelo rápido que compartilha a mesma configuração `fastModel`.

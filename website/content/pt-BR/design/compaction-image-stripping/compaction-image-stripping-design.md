# Remoção de Imagens na Compactação + Correção de Estimativa de Tokens

## Declaração do Problema

Quando o `ChatCompressionService` é acionado (auto ou manual), ele envia o `historyToCompress` literalmente para o modelo de sumarização. Dois problemas relacionados degradam a qualidade, precisão e custo:

1. **Vazamento de bytes de imagens/documentos inline no prompt de sumarização.** Ferramentas MCP que exibem anexos (capturas de tela, protótipos de design, PDFs) colocam partes `inlineData` diretamente na conversa. O pipeline de compressão não as remove, então o modelo de sumarização recebe base64 bruto que geralmente não consegue interpretar, e o payload da consulta lateral é inflado desnecessariamente.

2. **A estimativa de tokens do `findCompressSplitPoint` está errada para partes binárias.** O algoritmo do ponto de divisão usa `JSON.stringify(content).length` para distribuir caracteres pelo histórico. Uma única imagem base64 de 1 MB (~1,4 M caracteres) faz uma entrada parecer ~350 K tokens, ofuscando o texto real e tendenciando o corte para o lugar errado. O custo real de token para uma imagem Qwen-VL é no máximo alguns milhares de tokens. O estimador deve tratar partes binárias como uma constante pequena.

claude-code aborda (1) com `stripImagesFromMessages`. qwen-code não possui nem essa remoção nem a correção correspondente de contagem de caracteres.

Esta alteração adiciona ambos, com escopo apenas na **entrada da consulta lateral da compactação**. O histórico da conversa ativo, a persistência (`chats/<sessionId>.jsonl`) e o prompt enviado ao modelo principal na próxima rotação não são alterados. A redução se aplica apenas ao payload da consulta lateral construído dentro do `chatCompressionService`.

### Fora do escopo (adiado ou rejeitado)

- **Externalização de colagens grandes para um cache de colagem.** Um rascunho anterior deste design propôs fazer hash de texto muito grande em `~/.qwen/paste-cache/<sha>.txt` e substituir por um espaço reservado. Rejeitamos após pesquisar os lançamentos do claude-code de 2026-03 a 2026-05: a direção upstream é manter a entrada do usuário visível para o modelo e amortizar custo via cache de prompt (ajustes de TTL de 1h, redução de imagem) em vez de externalizá-la. Colocar a entrada do usuário literal atrás de um espaço reservado de hash arrisca "desvio de intenção" uma vez que a compactação tenha colapsado o texto original. Se revisitarmos isso mais tarde, o padrão correto é `read_paste(hash)` como uma ferramenta real que o modelo pode alcançar, não uma reescrita silenciosa.

## Estado Atual vs Alvo

| Preocupação                          | qwen-code atualmente                                      | referência claude-code                                            | Alvo após esta alteração                                            |
| ------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Imagem/documento no prompt compacto | Enviado literalmente                                        | `stripImagesFromMessages` substitui por `[image]` / `[document]` | Enviado como espaço reservado `[image: mime]` / `[document: mime]` |
| Estimativa de token para partes binárias | `JSON.stringify().length` (totalmente errada)               | Tratado como orçamento fixo                                      | Constante configurável (padrão 1.600 tokens / ~6.400 caracteres)   |
| Limpeza de imagem no microcompacto   | Não afetado (apenas resultados de ferramentas de texto limpos em idle) | MC baseado em tempo limpa tudo                               | Microcompacto também limpa imagens inline obsoletas junto com resultados de ferramentas |

## Alterações Propostas

### Camada 1: redução da entrada de compactação (`services/compactionInputSlimming.ts`)

Um novo módulo puro que recebe `Content[]` e retorna um `Content[]` reduzido. Uma transformação: remoção de mídia inline. Percorra cada `Part`. Se a parte tiver `inlineData` ou `fileData`, substitua por uma parte `text` no formato `[image: image/png]` (ou `[document: application/pdf]`).

qwen-code anexa mídia retornada por ferramentas em `functionResponse.parts` (uma extensão do esquema padrão `FunctionResponse` do `@google/genai`; veja `coreToolScheduler.createFunctionResponsePart`). O redutor faz recursão nesse array aninhado para que uma imagem base64 retornada por `read_file` ou qualquer ferramenta MCP que emita anexos também seja substituída.

A transformação retorna um novo array `Content[]`; o original nunca é mutado. Se a transformação não produzir alterações, a referência do array original é retornada (igual por identidade). O orquestrador chama `slimCompactionInput` como o último passo antes de `runSideQuery` em `chatCompressionService.ts`.

### Camada 2: correção de estimativa de token (`chatCompressionService.ts`)

`findCompressSplitPoint` atualmente usa `JSON.stringify(content).length` para distribuição de contagem de caracteres. Substitua isso por um auxiliar `estimateContentChars` que:

- Para partes `text`: `text.length`
- Para partes `inlineData` / `fileData`: `imageTokenEstimate * 4` (padrão 1.600 × 4 = 6.400 caracteres).
- Para partes `functionCall` / `functionResponse`: `JSON.stringify(part).length` (comportamento inalterado).

Esta é a mesma constante que o módulo de redução usa, para que o orçamento que o algoritmo do ponto de divisão vê corresponda ao que o prompt reduzido realmente consome downstream. Para evitar varreduras duplicadas, `compress()` pré-computa `charCounts` uma vez e os passa para `findCompressSplitPoint` (novo 4º argumento opcional); o mesmo array é reutilizado para a proteção `MIN_COMPRESSION_FRACTION`.
### Camada 3: Limpeza de imagem microcompact (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` agora retorna três grupos:

- `tool` — partes `functionResponse` de ferramentas internas compactáveis.
  Limpadas como unidade: a saída da resposta é substituída pelo sentinela,
  `functionResponse.parts` descartado junto.
- `media` — partes `inlineData` / `fileData` de nível superior em mensagens
  de função de usuário (ex.: imagens coladas via `@reference`). Substituídas por
  `[Mídia inline antiga removida: <mime>]`.
- `nested-media` — partes `functionResponse` de ferramentas **não compactáveis**
  (ex.: ferramentas de captura de tela do MCP cujos nomes não estão em
  `COMPACTABLE_TOOLS`) que carregam imagens/documentos no campo de extensão
  `functionResponse.parts`. Apenas a mídia aninhada é removida;
  a saída de texto da ferramenta é preservada.

Cada tipo tem seu próprio orçamento `keepRecent`. Definir
`toolResultsNumToKeep: 1` mantém a mais recente de cada categoria
(1 ferramenta + 1 mídia + 1 mídia aninhada), e não 1 entrada no total da
lista combinada.

Valores de mimeType provenientes de servidores de ferramentas MCP passam por
`sanitizeMimeForPlaceholder` antes de serem incorporados em qualquer string de
placeholder. O slimmer e o microcompact compartilham este helper.

### Camada 4: Configuração (`config/config.ts`)

Um novo campo nas configurações `chatCompression`:

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

Mais uma variável de ambiente para override operacional/de depuração: `QWEN_IMAGE_TOKEN_ESTIMATE`.

## Principais Decisões de Design

**Decisão 1: `imageTokenEstimate = 1600`.**
A família Qwen-VL limita-se a 1.280 tokens visuais por imagem sem
`vl_high_resolution_images`; com essa flag, até 16.384. 1.600 é um
meio-termo conservador ligeiramente acima — superestimar leva a
compactação mais cedo (seguro), subestimar leva a compactação tardia
(inseguro). Para modelos não-VL (Qwen3-Coder, o padrão do qwen-code), a
constante só importa para a correção da estimativa de tokens, já que
as imagens não chegam ao modelo.

**Decisão 2: Remover a cópia resumida, não o histórico ativo.**
`slimCompactionInput` retorna um array novo; o histórico de chat armazenado
em `GeminiChat` não é alterado. A persistência local
(`.chats/<sessionId>.jsonl`) mantém a conversa completa conforme o usuário
a vivenciou, então `--resume` funciona sem perdas.

**Decisão 3: Microcompact trata imagens de forma uniforme com resultados
antigos de ferramentas.** O gatilho ocioso baseado em tempo já limpa a
saída obsoleta de ferramentas; estendê-lo para imagens inline mantém a
política consistente e reutiliza a janela `keepRecent` existente.

**Decisão 4: Sem armazenamento de colagem / sem externalização de texto.**
Veja a seção Fora do escopo. O consenso upstream (claude-code 2026-03 →
2026-05) é manter a entrada do usuário verbatim visível e amortizar via
cache de prompt, não externalizar.

## Arquivos Afetados

**Arquivos novos**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Arquivos modificados**

- `packages/core/src/config/config.ts` — estende `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — chama slimming
  antes de `runSideQuery`; substitui helper de contagem de caracteres;
  pré-calcula charCounts uma vez para splitter + guard
- `packages/core/src/services/chatCompressionService.test.ts` — adiciona
  teste de integração verificando que base64 nunca chega ao modelo de resumo
- `packages/core/src/services/microcompaction/microcompact.ts` — estende
  coleta para imagens inline
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  teste de limpeza de imagem

## Limites do Escopo

**No escopo**

- Remover mídia inline da entrada de compactação
- Corrigir estimativa de caracteres do `findCompressSplitPoint`
- Limpeza de partes de imagem microcompact no gatilho ocioso
- Uma configuração + variável de ambiente

**Adiado**

- Externalização de colagens grandes (veja Fora do escopo acima)
- Ferramenta de reinflação (`read_paste(hash)` etc.)
- Deduplicação na camada de persistência
- Detalhamento de colagem no `/context`
- Eventos de telemetria para estatísticas de slim

## Perguntas em Aberto

1. **O texto do placeholder deve incluir um hash para permitir futura
   reinflação?** Hoje emitimos apenas `[imagem: image/png]`. Se/quando
   uma ferramenta no estilo `read_paste` surgir, talvez precisemos de um ID.
   Por enquanto o placeholder é informativo; a imagem original ainda existe
   no histórico ativo e na persistência.
2. **`imageTokenEstimate = 1600` é correto para modelos não-Qwen-VL servidos
   via proxies Anthropic / OpenAI?** Provavelmente uma ligeira subestimativa
   para o Claude (onde imagens podem chegar a ~5K tokens), mas inofensiva:
   afeta apenas a heurística do ponto de corte, nunca o prompt real que o
   modelo voltado ao usuário vê.
3. **O gate `MIN_COMPRESSION_FRACTION` é calculado com contagens de caracteres
   pré-slim.** Um trecho com muitas imagens pode passar no limite de 5%
   (porque as imagens contam como ~6.400 caracteres cada no estimador) e
   depois encolher para placeholders `[imagem: …]` pós-slim. O modelo de
   resumo então recebe quase nenhum contexto textual. Isso é intencional por
   enquanto: o resumo tem a função de registrar "o usuário compartilhou uma
   imagem de X" mesmo quando a maior parte do trecho era visual, e o propósito
   do gate é "há conteúdo suficiente para valer a pena resumir" — o que as
   imagens satisfazem razoavelmente. Se houver regressão de qualidade,
   podemos revisitar verificando novamente pós-slim ou ponderando o gate
   pela proporção de `imagesStripped`.

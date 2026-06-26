# Remoção de Imagens na Compactação + Correção na Estimativa de Tokens

## Declaração do Problema

Quando o `ChatCompressionService` é acionado (automática ou manualmente), ele envia
o `historyToCompress` para o modelo de sumarização sem modificações. Dois problemas
relacionados degradam a qualidade, precisão e custo:

1. **Bytes de imagem/documento inline vazam para o prompt de sumarização.**
   Ferramentas MCP que anexam conteúdos (capturas de tela, maquetes de design,
   PDFs) colocam partes `inlineData` diretamente na conversa. O pipeline de
   compactação não as remove, então o modelo de sumarização recebe base64 bruto
   que geralmente não consegue interpretar, e o payload da consulta lateral
   (side-query) é inflado desnecessariamente.

2. **A estimativa de tokens do `findCompressSplitPoint` está errada para partes
   binárias.** O algoritmo do ponto de corte usa
   `JSON.stringify(content).length` para distribuir caracteres pelo histórico.
   Uma única imagem base64 de 1 MB (~1,4 M caracteres) faz uma entrada parecer
   ~350 mil tokens, ofuscando o texto real e enviesando o corte para o lugar
   errado. O custo real de token para uma imagem Qwen-VL é no máximo alguns
   milhares de tokens. O estimador deveria tratar partes binárias como uma
   constante pequena.

O claude-code aborda (1) com `stripImagesFromMessages`. O qwen-code não possui
nem essa remoção nem a correção correspondente na contagem de caracteres.

Esta alteração adiciona ambos, com escopo restrito à **entrada da consulta lateral
(side-query) de compactação**. O histórico vivo da conversa, a persistência
(`chats/<sessionId>.jsonl`) e o prompt enviado ao modelo principal na próxima
interação permanecem intocados. A redução se aplica apenas ao payload da consulta
lateral montado dentro do `chatCompressionService`.

### Fora do escopo (adiado ou rejeitado)

- **Externalização de grandes colagens para um cache de colagem.** Uma versão
  anterior deste design propunha aplicar hash em textos muito grandes para
  `~/.qwen/paste-cache/<sha>.txt` e substituir por um placeholder. Nós a
  rejeitamos após analisar os lançamentos do claude-code de 2026-03 a 2026-05:
  a direção upstream é manter a entrada do usuário visível para o modelo e
  amortizar o custo via caching de prompt (ajustes de TTL de 1h, redução de
  imagem) em vez de externalizá-la. Colocar a entrada do usuário literal atrás
  de um placeholder hash corre o risco de "deriva de intenção" uma vez que a
  compactação tenha colapsado o texto original. Se revisitarmos isso depois, o
  padrão correto é `read_paste(hash)` como uma ferramenta real que o modelo
  pode usar, não uma reescrita silenciosa.

## Estado Atual vs Alvo

| Aspecto                          | qwen-code hoje                                         | referência claude-code                                            | Alvo após esta alteração                                             |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Imagem/documento no prompt compacto | Enviado literalmente                                | `stripImagesFromMessages` substitui por `[image]` / `[document]` | Enviado como placeholder `[image: mime]` / `[document: mime]`        |
| Estimativa de token para parte binária | `JSON.stringify().length` (totalmente errado)    | Tratado como orçamento fixo                                      | Constante configurável (padrão 1.600 tokens / ~6.400 caracteres)     |
| Limpeza de imagem no microcompacto | Não alterado (apenas resultados de ferramentas de texto limpos na inatividade) | MC baseado em tempo limpa tudo                                   | Microcompacto também limpa imagens inline obsoletas junto com resultados de ferramentas |

## Mudanças Propostas

### Camada 1: redução da entrada de compactação (`services/compactionInputSlimming.ts`)

Um novo módulo puro que recebe `Content[]` e retorna um `Content[]` reduzido.
Uma transformação: remoção de mídia inline. Percorre cada `Part`.
Se a parte tiver `inlineData` ou `fileData`, substitui por uma parte `text`
da forma `[image: image/png]` (ou `[document: application/pdf]`).

O qwen-code anexa a mídia retornada por ferramentas em `functionResponse.parts`
(uma extensão sobre o esquema padrão `FunctionResponse` do `@google/genai`;
veja `coreToolScheduler.createFunctionResponsePart`). O redutor faz recursão
nesse array aninhado para que uma imagem base64 retornada por `read_file` ou
qualquer ferramenta MCP que emita anexos também seja substituída.

A transformação retorna um novo array `Content[]`; o original nunca é mutado.
Se a transformação não produzir nenhuma alteração, a referência do array original
é retornada (igualdade de identidade). O orquestrador chama `slimCompactionInput`
como o último passo antes de `runSideQuery` no `chatCompressionService.ts`.

### Camada 2: correção da estimativa de tokens (`chatCompressionService.ts`)

Atualmente, `findCompressSplitPoint` usa `JSON.stringify(content).length` para
distribuir contagem de caracteres. Substituir por um helper `estimateContentChars` que:

- Para partes `text`: `text.length`
- Para partes `inlineData` / `fileData`: `imageTokenEstimate * 4` (padrão
  1.600 × 4 = 6.400 caracteres).
- Para partes `functionCall` / `functionResponse`:
  `JSON.stringify(part).length` (comportamento inalterado).

Esta é a mesma constante que o módulo de redução usa, então o orçamento que o
algoritmo de ponto de corte vê corresponde ao que o prompt reduzido realmente
consome downstream. Para evitar percursos duplicados, `compress()` pré-calcula
`charCounts` uma vez e os passa para `findCompressSplitPoint` (novo 4º argumento
opcional); o mesmo array é reutilizado para a proteção `MIN_COMPRESSION_FRACTION`.

### Camada 3: limpeza de imagem no microcompacto (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` agora retorna três grupos:

- `tool` — partes `functionResponse` de ferramentas internas compactáveis.
  Limpas como unidade: a saída da resposta é substituída pelo sentinela,
  `functionResponse.parts` é descartado junto.
- `media` — partes `inlineData` / `fileData` de alto nível sob mensagens de
  papel de usuário (ex.: imagens coladas via `@reference`). Substituídas por
  `[Old inline media cleared: <mime>]`.
- `nested-media` — partes `functionResponse` de ferramentas **não compactáveis**
  (ex.: ferramentas MCP de captura de tela cujos nomes não estão em
  `COMPACTABLE_TOOLS`) que carregam imagens/documentos no campo de extensão
  `functionResponse.parts`. Apenas a mídia aninhada é descartada; a saída de
  texto da ferramenta é preservada.

Cada tipo tem seu próprio orçamento `keepRecent`. Definir
`toolResultsNumToKeep: 1` mantém o mais recente de cada categoria
(1 ferramenta + 1 mídia + 1 mídia aninhada), não 1 entrada no total na lista
combinada.

Os valores de mimeType vindos de servidores de ferramentas MCP são passados
por `sanitizeMimeForPlaceholder` antes de serem inseridos em qualquer string
placeholder. O redutor e o microcompacto compartilham esse helper.

### Camada 4: configuração (`config/config.ts`)

Um novo campo nas configurações de `chatCompression`:

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

Além de uma variável de ambiente para operações/debug: `QWEN_IMAGE_TOKEN_ESTIMATE`.

## Principais Decisões de Design

**Decisão 1: `imageTokenEstimate = 1600`.**
A família Qwen-VL limita em 1.280 tokens visuais por imagem sem
`vl_high_resolution_images`; com essa flag, até 16.384. 1.600 é um
meio-termo conservador ligeiramente alto — superestimar leva a compactação
mais cedo (seguro), subestimar leva a compactação tardia (inseguro). Para
modelos não-VL (Qwen3-Coder, o padrão do qwen-code) a constante só importa
para a correção da estimativa de tokens, já que imagens não chegam ao modelo.

**Decisão 2: Reduzir a cópia reduzida, não o histórico vivo.**
`slimCompactionInput` retorna um array novo; o histórico da conversa
armazenado em `GeminiChat` não é alterado. A persistência local
(`.chats/<sessionId>.jsonl`) mantém a conversa completa como o usuário
a experimentou, então `--resume` funciona sem perdas.

**Decisão 3: Microcompacto trata imagens uniformemente com resultados
antigos de ferramentas.** O gatilho de inatividade baseado em tempo já
limpa saídas obsoletas de ferramentas; estendê-lo para imagens inline
mantém a política consistente e reutiliza a janela `keepRecent` existente.

**Decisão 4: Sem armazenamento de colagem / sem externalização de texto.**
Veja a seção Fora do escopo. O consenso upstream (claude-code 2026-03 →
2026-05) é manter a entrada do usuário literal visível e amortizar via
caching de prompt, não externalizar.

## Arquivos Afetados

**Novos arquivos**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Arquivos modificados**

- `packages/core/src/config/config.ts` — estender `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — chamar redução
  antes de `runSideQuery`; substituir helper de contagem de caracteres;
  pré-calcular charCounts uma vez para o divisor + proteção
- `packages/core/src/services/chatCompressionService.test.ts` — adicionar
  teste de integração afirmando que base64 nunca chega ao modelo de sumarização
- `packages/core/src/services/microcompaction/microcompact.ts` — estender
  a coleta para imagens inline
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  testar limpeza de imagem

## Limites de Escopo

**No escopo**

- Remover mídia inline da entrada de compactação
- Corrigir a estimativa de caracteres do `findCompressSplitPoint`
- Limpeza de partes de imagem no microcompacto no gatilho de inatividade
- Uma configuração + variável de ambiente

**Adiado**

- Externalização de grandes colagens (veja Fora do escopo acima)
- Ferramenta de reinflação (`read_paste(hash)` etc.)
- Deduplicação na camada de persistência
- Detalhamento de colagem `/context`
- Eventos de telemetria para estatísticas de redução

## Perguntas em Aberto

1. **O texto do placeholder deve incluir um hash para permitir reinflação
   futura?** Hoje emitimos apenas `[image: image/png]`. Se/quando uma
   ferramenta estilo `read_paste` surgir, podemos querer um ID. Por enquanto
   o placeholder é informativo; a imagem original ainda existe no histórico
   vivo e na persistência.
2. **`imageTokenEstimate = 1600` está correto para modelos não-Qwen-VL
   servidos via proxies Anthropic / OpenAI?** Provavelmente uma leve
   subestimativa para Claude (onde imagens podem ter até ~5K tokens), mas
   inofensiva: afeta apenas a heurística do ponto de corte, nunca o prompt
   real que o modelo voltado ao usuário vê.
3. **A proteção `MIN_COMPRESSION_FRACTION` é calculada com contagens de
   caracteres pré-redução.** Um trecho com muitas imagens pode passar do
   limite de 5% (porque as imagens contam como ~6.400 caracteres cada no
   estimador) e depois encolher para placeholders `[image: …]` pós-redução.
   O modelo de sumarização então recebe quase nenhum contexto textual. Isso
   é intencional por enquanto: o trabalho do sumário é registrar "usuário
   compartilhou uma imagem de X" mesmo quando a maior parte do trecho era
   visual, e o propósito da proteção é "há conteúdo suficiente para valer
   a pena sumarizar" — o que imagens razoavelmente satisfazem. Se a
   qualidade regredir, podemos revisitar reavaliando pós-redução ou
   enviesando a proteção pela proporção de `imagesStripped`.
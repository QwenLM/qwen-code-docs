# Renderização Unificada de Saída de Ferramentas

## Contexto

A TUI anteriormente tinha dois modos de renderização para resultados de ferramentas:

- **Modo compacto** (Ctrl+O): colapsava resultados de ferramentas concluídas em um resumo de uma linha
- **Modo normal**: mostrava resultados completos de ferramentas inline, causando ruído vertical excessivo

Os usuários precisavam alternar manualmente entre os modos. Na maioria das vezes, os resultados de ferramentas concluídas (conteúdos de arquivos, resultados de busca, etc.) não agregavam valor ao fluxo da conversa.

## Design

### Princípio Central

**Um único modo unificado**: a renderização da ferramenta é determinada pela categoria da ferramenta, não por um modo alternado pelo usuário. Ferramentas de coleta de informações (ler/buscar/listar) são recolhidas em um resumo; ferramentas de mutação (editar/escrever/comando/agente) sempre renderizam individualmente com resultados completos.

### Resumo Semântico (`buildToolSummary`)

Em vez de mostrar nomes e contagens brutos de ferramentas (`ReadFile x 3`), gere resumos legíveis por humanos usando um formato baseado em contagem:

| Cenário                  | Saída                                                    |
| ------------------------ | -------------------------------------------------------- |
| Ferramenta única         | `Leu 1 arquivo` / `Executou 1 comando`                  |
| Várias do mesmo tipo     | `Leu 3 arquivos`                                         |
| Tipos mistos             | `Executou 1 comando, leu 3 arquivos, editou 2 arquivos` |
| Ativo (executando)       | `Lendo 1 arquivo` (gerúndio)                             |
| Concluído                | `Leu 1 arquivo` (pretérito)                              |

### Categorias de Ferramentas

| Categoria | Nomes de Exibição             | Verbo no Passado | Verbo no Ativo | Recolhível |
| --------- | ----------------------------- | ---------------- | -------------- | ---------- |
| read      | ReadFile, Read File(s)        | Leu              | Lendo          | Sim        |
| edit      | Edit, NotebookEdit            | Editou           | Editando       | Não        |
| write     | WriteFile                     | Escreveu         | Escrevendo     | Não        |
| search    | Grep, Glob                    | Buscou           | Buscando       | Sim        |
| list      | ListFiles, Read Directory     | Listou           | Listando       | Sim        |
| command   | Shell                         | Executou         | Executando     | Não        |
| agent     | Agent, Workflow, SendMessage  | Executou         | Executando     | Não        |
| other     | (todo o resto)                | Usou             | Usando         | Não        |

### Regras de Renderização

1. **Particionamento baseado em tipo**: ferramentas são divididas por `isCollapsibleTool()` — ferramentas recolhíveis (ler/buscar/listar) renderizam como uma linha de resumo `CompactToolGroupDisplay`; ferramentas não recolhíveis (editar/escrever/comando/agente/outro) renderizam individualmente via `ToolMessage`
2. **Grupos apenas de memória** têm um caminho de renderização dedicado (emblema de contagem de leitura/escrita) que tem prioridade, mas apenas quando todas as operações são bem-sucedidas (`!hasErrorTool && every status === Success`)
3. **Recolhimento de resultados**: apenas ferramentas recolhíveis com status `Success` têm seu texto/saída ANSI colapsados. Ferramentas não recolhíveis (incluindo ferramentas MCP, WebFetch, etc.) sempre mostram resultados. Ferramentas canceladas mantêm saída parcial visível
4. **Nomes de ferramentas** renderizam em negrito independentemente do status, garantindo estilo consistente tanto em `CompactToolGroupDisplay` quanto em `ToolMessage`
5. **Condições de expansão forçada**: quando qualquer ferramenta em um grupo está confirmando, com erro, iniciada pelo usuário, em um shell focado, ou um subagente de terminal, TODAS as ferramentas renderizam individualmente (sem particionamento) com resultados forçados visíveis apenas para as ferramentas acionadoras (com erro, confirmando, subagente de terminal) — ferramentas irmãs bem-sucedidas mantêm comportamento normal de recolhimento
6. **Itens `tool_use_summary`** (resumos semânticos gerados por LLM) renderizam incondicionalmente junto com a contagem mecânica do `CompactToolGroupDisplay` — eles servem propósitos diferentes (contexto semântico vs contagem de ferramentas)
7. **Emblema de memória**: renderizado tanto no caminho totalmente recolhível quanto no caminho misto quando operações de memória estão presentes em um grupo que não é apenas de memória

### Principais Alterações

| Arquivo                        | Alteração                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompactToolGroupDisplay.tsx`  | Adicionado `buildToolSummary()` com formato de contagem, `isCollapsibleTool()`, removidos estilos de borda                                                   |
| `ToolMessage.tsx`              | `shouldCollapseResult` limitado a `isCollapsibleTool()` e `Success` apenas; `isDim` removido                                                                |
| `ToolGroupMessage.tsx`         | Particionamento baseado em tipo substitui `showCompact`; `forceShowResult` simplificado para `forceExpandAll`; orçamento de altura considera linha de resumo recolhível |
| `MainContent.tsx`              | Removido alias `mergedHistory`, `absorbedCallIds`, `summaryByCallId`, mesclagem entre grupos                                                                 |
| `HistoryItemDisplay.tsx`       | `tool_use_summary` renderiza incondicionalmente (removida a condição `summaryAbsorbed`)                                                                      |
| `mergeCompactToolGroups.ts`    | `compactToggleHasVisualEffect` não aciona mais em `tool_group` (modo compacto não tem efeito na renderização de ferramentas)                                  |

## Alternativas Consideradas

1. **Manter dois modos com resumos melhorados**: Rejeitado — sobrecarga cognitiva desnecessária para os usuários
2. **Resumo por ferramenta (estilo Gemini CLI)**: Cada ferramenta tem sua própria seta de resumo. Rejeitado — ainda muito verboso para grandes lotes de ferramentas
3. **Implantação em fases**: Rejeitado — preferência dos usuários por uma única passada de implementação
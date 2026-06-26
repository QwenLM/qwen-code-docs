# Renderização de Markdown

O Qwen Code renderiza estruturas comuns de Markdown diretamente na TUI para que as respostas do modelo sejam mais fáceis de escanear sem sair do terminal. O renderizador foi projetado para manter a fonte original acessível, especialmente para blocos visuais como diagramas Mermaid e matemática LaTeX.

## Modos Render e Raw

Por padrão, o Markdown é exibido no modo `render`. Blocos suportados são mostrados como prévias visuais quando possível:

- Blocos de código cercados do tipo Mermaid
- Tabelas Markdown
- Listas de tarefas
- Blockquotes
- Matemática LaTeX inline e em bloco
- Blocos de código cercados com realce de sintaxe

Pressione `Alt/Option+M` para alternar entre os modos na sessão atual. No macOS, o terminal deve enviar Option como Meta para este atalho; caso contrário, Option+M é tratado como entrada de texto normal.

- `render`: mostra prévias ricas no terminal para Markdown suportado.
- `raw`: mostra a fonte orientada a Markdown para blocos visuais como Mermaid, tabelas e LaTeX.

Para iniciar o Qwen Code no modo raw por padrão, configure `ui.renderMode`:

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

Os valores aceitos são `"render"` e `"raw"`. O atalho altera apenas a visualização da sessão atual; ele não reescreve seu arquivo de configurações.

## Mermaid

Blocos de código cercados `mermaid` são renderizados visualmente no modo `render`. A TUI usa uma estratégia em camadas:

1. Se ativado e suportado, o Qwen Code solicita que o Mermaid CLI (`mmdc`) renderize o diagrama como PNG e o envia para o protocolo de imagem do terminal.
2. Se as imagens no terminal não estiverem disponíveis, mas o `chafa` estiver instalado, o mesmo PNG pode ser convertido para gráficos de bloco ANSI.
3. Caso contrário, o Qwen Code recai para um wireframe do terminal ou uma prévia textual compacta.
4. Se um tipo de diagrama Mermaid não puder ser pré-visualizado, o Qwen Code mostra a fonte cercada original em vez de escondê-la atrás de um placeholder.

A renderização de imagem Mermaid está desabilitada por padrão porque requer renderizadores externos e suporte a imagem no terminal. Ative-a com:

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

Variáveis de ambiente opcionais:

| Variável                                    | Descrição                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`       | Ativa a renderização de imagem Mermaid externa.                                                |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`        | Desativa a renderização de imagem Mermaid mesmo quando ativada em outro lugar.                 |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`    | Força a saída do protocolo Kitty. Útil para terminais como Kitty e Ghostty.                    |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`   | Solicita imagens inline do iTerm2. A renderização interativa da TUI recai para texto/ANSI.     |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`      | Desativa os protocolos de imagem do terminal e permite fallback para texto ou `chafa`.         |
| `QWEN_CODE_MERMAID_MMD_CLI=/caminho/para/mmdc` | Usa um executável específico do Mermaid CLI.                                                   |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`             | Permite que o Qwen Code execute `npx @mermaid-js/mermaid-cli` quando `mmdc` não está instalado.|
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1` | Permite binários de renderizadores locais ao projeto em `node_modules/.bin`.                   |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`       | Substitui a largura de renderização do PNG.                                                    |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000` | Substitui o tempo limite do renderizador externo, limitado a 60000 ms.                         |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`   | Ajusta o ajuste de linhas da imagem para a geometria das células da fonte do terminal.         |

A primeira renderização de imagem pode ser lenta, especialmente quando o `npx` precisa resolver ou baixar o Mermaid CLI. Durante o streaming, o Qwen Code mostra uma prévia textual limitada e tenta a renderização de imagem apenas após a resposta do modelo estar completa.

### Cópia da Fonte Mermaid

Cada bloco Mermaid renderizado inclui uma dica de fonte como:

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

Use estes comandos para copiar a fonte Mermaid da última resposta da IA:

| Comando                | Comportamento                                  |
| ---------------------- | ---------------------------------------------- |
| `/copy mermaid`        | Copia o último bloco Mermaid.                  |
| `/copy mermaid 1`      | Copia o primeiro bloco Mermaid.                |
| `/copy code mermaid`   | Copia o último bloco de código cercado `mermaid`. |
| `/copy code mermaid 1` | Copia o primeiro bloco de código cercado `mermaid`. |

`/copy code 1` conta todos os blocos de código cercados, não apenas os Mermaid. Use `/copy mermaid N` quando quiser a sequência específica de Mermaid mostrada no título renderizado.

## Matemática LaTeX

O Qwen Code suporta renderização básica de LaTeX inline e em bloco no terminal:

```markdown
Matemática inline: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```

O renderizador foca em símbolos comuns e saída legível no terminal. Não é um motor TeX completo; layouts complexos como matrizes, equações alinhadas e expressões grandes aninhadas podem ser simplificadas.

Expressões inline `$...$` são intencionalmente limitadas a 1024 caracteres por linha para que Markdown malformado ou muito grande não pare a renderização do terminal. Fórmulas mais longas permanecem visíveis como texto fonte e ainda podem ser copiadas do modo raw ou da resposta original.

### Cópia da Fonte LaTeX

Use estes comandos para copiar a fonte LaTeX da última resposta da IA:

| Comando                | Comportamento                                   |
| ---------------------- | ----------------------------------------------- |
| `/copy latex`          | Copia a última expressão LaTeX em bloco.        |
| `/copy latex 2`        | Copia a segunda expressão em bloco.             |
| `/copy latex inline`   | Copia a última expressão inline.               |
| `/copy latex inline 2` | Copia a segunda expressão inline.               |
| `/copy inline-latex 2` | Alias para `/copy latex inline 2`.              |

LaTeX inline não mostra uma dica de cópia por expressão no texto renderizado para evitar poluir a prosa. Mude para o modo raw com `Alt/Option+M` quando quiser inspecionar a fonte inline no local; no macOS isso requer entrada de terminal com Option como Meta.

## Cópia Geral de Código

O comando `/copy code` lê blocos de código cercados da última resposta Markdown da IA:

| Comando                 | Comportamento                                    |
| ----------------------- | ------------------------------------------------ |
| `/copy code`            | Copia o último bloco de código cercado.          |
| `/copy code 2`          | Copia o segundo bloco de código cercado.         |
| `/copy code typescript` | Copia o último bloco de código `typescript`.     |
| `/copy code mermaid 1`  | Copia o primeiro bloco de código `mermaid`.      |

## Selecionando uma Mensagem Anterior da IA

Por padrão, `/copy` tem como alvo a mensagem mais recente da IA. Prefixe o comando com um inteiro positivo para copiar da N-ésima última mensagem da IA — útil quando a resposta mais recente tem pouco sinal (por exemplo, uma atualização de TODO) e a saída substancial está uma ou duas rodadas atrás.

| Comando               | Comportamento                                                |
| --------------------- | ------------------------------------------------------------ |
| `/copy 2`             | Copia a penúltima mensagem da IA por completo.               |
| `/copy 3`             | Copia a antepenúltima mensagem da IA por completo.           |
| `/copy 2 code python` | Copia o último bloco de código `python` da penúltima.        |
| `/copy 3 latex`       | Copia o último bloco LaTeX da antepenúltima mensagem.        |

`/copy 1` é equivalente a `/copy`. Se `N` exceder o número de mensagens da IA na sessão, `/copy` informa a contagem real em vez de copiar algo. Sem um inteiro inicial, subseletores como `/copy code python 2` mantêm seu significado existente (o segundo bloco `python` na última mensagem).

## Limitações Atuais

- A renderização de imagem Mermaid depende do Mermaid CLI e do suporte a imagem do terminal.
- A colocação assíncrona de imagem inline do iTerm2 está desabilitada na TUI porque o protocolo é vinculado à posição do cursor; use Kitty/Ghostty ou fallback ANSI para prévias interativas de imagem.
- A renderização wireframe do Mermaid é uma prévia textual legível no terminal, não um motor de layout Mermaid completo.
- O modo raw é global para blocos Markdown renderizados; não é uma alternância por bloco.
- A renderização LaTeX cobre símbolos e expressões comuns, não layout TeX completo.
- Os comandos de cópia de fonte têm como alvo a última resposta da IA por padrão, ou a N-ésima última quando invocados como `/copy N ...`.
# Renderização de Markdown

O Qwen Code renderiza estruturas comuns de Markdown diretamente na TUI, para que
as respostas do modelo sejam mais fáceis de escanear sem sair do terminal. O
renderizador foi projetado para manter a fonte original acessível,
especialmente para blocos visuais, como diagramas Mermaid e LaTeX math.

## Modos Render e Raw

Por padrão, o Markdown é exibido no modo `render`. Blocos suportados são
renderizados como pré-visualizações visuais quando possível:

- Blocos de código cercados do Mermaid
- Tabelas Markdown
- Listas de tarefas
- Blockquotes
- LaTeX math inline e em bloco
- Blocos de código cercados com destaque de sintaxe

Pressione `Alt/Option+M` para alternar o modo da sessão atual. No macOS, o
terminal deve enviar Option como Meta para este atalho; caso contrário,
Option+M é tratado como entrada de texto normal.

- `render`: mostra pré-visualizações ricas no terminal para Markdown suportado.
- `raw`: mostra Markdown orientado à fonte para blocos visuais como Mermaid,
  tabelas e LaTeX.

Para iniciar o Qwen Code no modo raw por padrão, defina `ui.renderMode`:

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

Os valores aceitos são `"render"` e `"raw"`. O atalho altera apenas a
visualização da sessão atual; ele não reescreve seu arquivo de configuração.

## Mermaid

Blocos de código cercados do tipo `mermaid` são renderizados visualmente no
modo `render`. A TUI usa uma estratégia em camadas:

1. Se habilitado e suportado, o Qwen Code solicita ao Mermaid CLI (`mmdc`) que
   renderize o diagrama como PNG e o envia ao protocolo de imagem do terminal.
2. Se as imagens do terminal não estiverem disponíveis, mas `chafa` estiver
   instalado, o mesmo PNG pode ser convertido em gráficos de bloco ANSI.
3. Caso contrário, o Qwen Code recorre a um wireframe de terminal ou prévia de
   texto compacta.
4. Se um tipo de diagrama Mermaid não puder ser pré-visualizado, o Qwen Code
   mostra o código cercado original em vez de escondê-lo atrás de um
   placeholder.

A renderização de imagem Mermaid é desabilitada por padrão porque requer
renderizadores externos e suporte a imagens no terminal. Ative-a com:

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

Variáveis de ambiente opcionais:

| Variável                                     | Descrição                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`        | Ativa a renderização de imagem Mermaid externa.                                        |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`         | Desativa a renderização de imagem Mermaid mesmo quando ativada em outro lugar.         |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`     | Força a saída do protocolo Kitty. Útil para terminais como Kitty e Ghostty.            |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`    | Solicita imagens inline do iTerm2. A renderização TUI interativa recai para texto/ANSI.|
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`       | Desativa os protocolos de imagem do terminal e permite fallback para texto ou `chafa`. |
| `QWEN_CODE_MERMAID_MMD_CLI=/caminho/para/mmdc` | Usa um executável específico do Mermaid CLI.                                           |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`              | Permite que o Qwen Code execute `npx @mermaid-js/mermaid-cli` quando `mmdc` não está instalado.|
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1`  | Permite binários de renderização locais do projeto em `node_modules/.bin`.             |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`        | Substitui a largura de renderização PNG.                                                |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000`  | Substitui o tempo limite de renderização externa, limitado a 60000 ms.                 |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`    | Ajusta o ajuste de linhas da imagem para a geometria das células da fonte do terminal. |

A primeira renderização de imagem pode ser lenta, especialmente quando o `npx`
precisa resolver ou baixar o Mermaid CLI. Durante o streaming, o Qwen Code
mostra uma prévia de texto limitada e tenta a renderização de imagem apenas
após a resposta do modelo estar completa.

### Cópia da Fonte Mermaid

Cada bloco Mermaid renderizado inclui uma dica de fonte como:

```text
Mermaid flowchart (TD) · fonte: /copy mermaid 1
```

Use estes comandos para copiar a fonte Mermaid da última resposta da IA:

| Comando                | Comportamento                                      |
| ---------------------- | -------------------------------------------------- |
| `/copy mermaid`        | Copia o último bloco Mermaid.                      |
| `/copy mermaid 1`      | Copia o primeiro bloco Mermaid.                    |
| `/copy code mermaid`   | Copia o último bloco de código cercado `mermaid`.  |
| `/copy code mermaid 1` | Copia o primeiro bloco de código cercado `mermaid`.|

`/copy code 1` conta todos os blocos de código cercados, não apenas os Mermaid.
Use `/copy mermaid N` quando quiser a sequência específica do Mermaid mostrada
no título renderizado.

## LaTeX Math

O Qwen Code suporta renderização básica de LaTeX inline e em bloco no terminal:

```markdown
Matemática inline: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```
O renderizador foca em símbolos comuns e saída legível no terminal. Ele não é
um motor TeX completo; layouts complexos como matrizes, equações alinhadas e
expressões grandes aninhadas podem ser simplificados.

Expressões inline `$...$` são intencionalmente limitadas a 1024 caracteres por
linha para que Markdown malformado ou muito grande não possa travar a renderização
do terminal. Fórmulas mais longas permanecem visíveis como texto fonte e podem ser
copiadas do modo raw ou da resposta original.

### Cópia do código-fonte LaTeX

Use estes comandos para copiar o código-fonte LaTeX da última resposta da IA:

| Comando                  | Comportamento                                |
| ----------------------- | --------------------------------------------- |
| `/copy latex`          | Copia a última expressão LaTeX em bloco.      |
| `/copy latex 2`        | Copia a segunda expressão em bloco.           |
| `/copy latex inline`   | Copia a última expressão inline.              |
| `/copy latex inline 2` | Copia a segunda expressão inline.             |
| `/copy inline-latex 2` | Atalho para `/copy latex inline 2`.          |

LaTeX inline não exibe uma dica de cópia por expressão no texto renderizado para
evitar poluir a prosa. Mude para modo raw com `Alt/Option+M` quando quiser
inspecionar o código-fonte inline no lugar; no macOS, isso requer entrada de
terminal Option-como-Meta.

## Cópia Geral de Código

O comando `/copy code` lê blocos de código cercados da última resposta em Markdown da IA:

| Comando                 | Comportamento                                 |
| ----------------------- | ---------------------------------------------- |
| `/copy code`            | Copia o último bloco de código cercado.        |
| `/copy code 2`          | Copia o segundo bloco de código cercado.       |
| `/copy code typescript` | Copia o último bloco de código `typescript`.   |
| `/copy code mermaid 1`  | Copia o primeiro bloco de código `mermaid`.    |

## Selecionando uma Mensagem Anterior da IA

Por padrão, `/copy` tem como alvo a mensagem mais recente da IA. Prefixe o comando com
um número inteiro positivo para copiar da N-ésima última mensagem da IA — útil quando
a resposta mais recente é algo de baixo sinal (ex.: uma atualização de TODO) e a
saída substancial está uma ou duas rodadas atrás.

| Comando               | Comportamento                                               |
| --------------------- | ------------------------------------------------------------ |
| `/copy 2`             | Copia a penúltima mensagem da IA por completo.               |
| `/copy 3`             | Copia a antepenúltima mensagem da IA por completo.           |
| `/copy 2 code python` | Copia o último bloco de código `python` da penúltima.        |
| `/copy 3 latex`       | Copia o último bloco LaTeX da antepenúltima mensagem.        |

`/copy 1` é equivalente a `/copy`. Se `N` exceder o número de mensagens da IA
na sessão, `/copy` reporta a contagem real em vez de copiar algo. Sem um número
inteiro inicial, sub-seletores como `/copy code python 2` mantêm seu significado
existente (o segundo bloco `python` na última mensagem).

## Limitações Atuais

- A renderização de imagens Mermaid depende do Mermaid CLI e do suporte a imagens no terminal.
- A colocação inline assíncrona de imagens do iTerm2 está desabilitada na TUI porque o
  protocolo é vinculado à posição do cursor; use Kitty/Ghostty ou fallback ANSI para
  pré-visualizações interativas de imagens.
- A renderização de wireframe Mermaid é uma pré-visualização legível no terminal, não um
  motor de layout Mermaid completo.
- O modo raw é global para blocos Markdown renderizados; não é uma alternância por bloco.
- A renderização LaTeX cobre símbolos e expressões comuns, não layout TeX completo.
- Os comandos de cópia de fonte têm como alvo a última resposta da IA por padrão, ou a N-ésima
  última quando invocados como `/copy N ...`.

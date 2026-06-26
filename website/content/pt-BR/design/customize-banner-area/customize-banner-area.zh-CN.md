# Design de Área de Banner Customizável

> Permite que o usuário substitua o Logo ASCII QWEN, substitua o título da marca e oculte o Banner por completo —
> mas **não** permite remover informações de tempo de execução necessárias para depuração e confiabilidade (versão, tipo de autenticação, modelo, diretório de trabalho).

## Visão Geral

Quando o Qwen Code CLI inicia, ele imprime um Banner no topo do terminal, contendo o Logo ASCII QWEN e um painel de informações com borda. Vários cenários reais exigem controle sobre essa área:

- **White-label / Integração de marca de terceiros**: Ao incorporar o Qwen Code em produtos próprios de empresas ou equipes, é necessário exibir a própria marca em vez do padrão "Qwen Code".
- **Personalização**: Usuários individuais desejam que o Banner do terminal esteja de acordo com as normas da equipe ou sua estética pessoal.
- **Multilocatário / Distinção de múltiplas instâncias**: Em ambientes compartilhados, diferentes equipes desejam identificar rapidamente qual instância estão usando.

A posição do design é muito simples: **a aparência da marca pode ser substituída; as informações de tempo de execução não podem ser substituídas**.
A personalização permite apenas que o usuário sobreponha sua própria marca, **não** permite ocultar informações críticas para depuração.
Cada decisão de "pode/não pode" nas seções seguintes deste documento deriva dessa posição.

Issue correspondente: [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Divisão da Área do Banner

O Banner atual é renderizado pelo `Header` (montado pelo `AppHeader`), e pode ser dividido da seguinte forma:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Coluna do Logo ───────┐  gap=2  ┌──── Painel de informações (com borda) ─┐
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Título:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtítulo: «Linha em branco / cobertura customizada» │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:    Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Caminho:    ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              Propriedade: AppHeader
                          │ O componente Tips é renderizado abaixo (controlado por ui.hideTips) │
```

Dois blocos principais:

- **A. Coluna do Logo** — Bloco único de arte ASCII com gradiente.
  Fonte atual: `shortAsciiLogo` em `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Painel de informações** — Caixa de informações com borda, totalizando quatro linhas. A segunda linha é por padrão um espaçador visual vazio, opcionalmente pode ser substituída por um subtítulo fornecido pelo chamador:
  - **B① Título**: `>_ Qwen Code (vX.Y.Z)` — Texto da marca + sufixo de versão.
  - **B② Subtítulo / espaçador**: Por padrão é uma linha de espaço único; se `ui.customBannerSubtitle` estiver configurado, renderiza uma string de subtítulo de linha única sanitizada (por exemplo, um fork usa `Built-in DataWorks Official Skills`).
  - **B③ Status**: `<tipo de exibição de autenticação> | <modelo> (alternar com /model)`.
  - **B④ Caminho**: Diretório de trabalho após tildeify e encurtamento.

O `<AppHeader>` externo já trata de ocultar o Banner no modo de leitor de tela (`showBanner = !config.getScreenReader()`), retornando para saída de texto puro nesse modo.

## Regras de Customização — O que pode ser alterado, o que está bloqueado

| Área                               | Fonte Atual                           | Categoria de Customização          | Motivo do Bloqueio/Liberação                                                                                                                                                              |
| ---------------------------------- | ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Coluna do Logo**              | `shortAsciiLogo` (`AsciiArt.ts`)      | **Substituível + Ocultável automaticamente** | Área puramente de marca. Cenários white-label precisam de controle visual total. O comportamento existente de "ocultar Logo automaticamente em terminais estreitos" permanece inalterado. |
| **B①. Texto do título** (`>_ Qwen Code`) | Codificado (`Header.tsx`)             | **Substituível**                   | Área de marca. O caractere `>_` no início faz parte da marca existente; se não for desejado, o usuário pode omiti-lo no `customBannerTitle`.                                              |
| **B①. Sufixo de versão** (`(vX.Y.Z)`) | Propriedade `version`                 | **Bloqueado**                      | Essencial para depuração e suporte. Ocultá-lo dificultaria responder "que versão você está usando?" a não ser via `--version`, gerando custo real no fluxo de suporte. Sacrificamos um pouco da experiência white-label pela acessibilidade ao suporte. |
| **B②. Linha de subtítulo/espaçador**   | Espaço em branco padrão              | **Substituível**                   | Área puramente de marca/contexto. Forks white-label a usam para marcar a versão de build (ex.: "Built-in DataWorks Official Skills"). Regras de sanitização iguais às do título; apenas uma linha, sem quebras de linha que danifiquem o layout. |
| **B③. Linha de status** (autenticação + modelo) | Propriedades `formattedAuthType`, `model` | **Bloqueado**                      | Sinal operacional e de segurança. O usuário deve ver quais credenciais estão em uso e qual modelo está consumindo tokens. Qualquer ocultação/substituição é um "footgun", mesmo em cenários white-label. |
| **B④. Linha de caminho** (diretório de trabalho) | Propriedade `workingDirectory`        | **Bloqueado**                      | Informação operacional. "Em que diretório estou?" é uma pergunta frequente; o Banner é a única resposta autoritativa.                                                                       |
| **Banner inteiro** (A + B)         | Ponto de montagem `<Header>` em `AppHeader.tsx` | **Ocultável**          | Um `ui.hideBanner: true` pula ambos os blocos A e B — formato idêntico ao interruptor existente de modo leitor de tela. O `<Tips>` continua controlado separadamente por `ui.hideTips`. |

A matriz acima corresponde a quatro itens de configuração, apenas:

| Configuração                  | Valor Padrão | Efeito                                                                                                       | Área Afetada    |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ | --------------- |
| `ui.hideBanner`               | `false`      | Oculta o Banner inteiro (área A + B).                                                                        | A + B           |
| `ui.customBannerTitle`        | não definido | Substitui o texto da marca em B①. O sufixo da versão é anexado normalmente. Será feito trim; string vazia = usa padrão. | B① texto da marca |
| `ui.customBannerSubtitle`     | não definido | Substitui o espaçador em branco em B② por uma linha de subtítulo. Será sanitizado; limite de 160 caracteres; string vazia = mantém espaçador em branco (backward-compatible). | B② linha espaçadora |
| `ui.customAsciiArt`           | não definido | Substitui a área A. Suporta três formas de dados (veja abaixo). Qualquer erro reverte para o padrão.         | A               |
**Capacidades deliberadamente não fornecidas:**

- Não fornece uma chave para "ocultar apenas o sufixo da versão".
- Não fornece uma chave para "ocultar apenas a linha de autenticação/modelo".
- Não fornece uma chave para "ocultar apenas a linha de caminho".
- Não fornece uma entrada para modificar a cor gradiente do Logo (a cor é de responsabilidade do tema).
- Não fornece a capacidade de ajustar a ordem ou estrutura do painel de informações.

Se houver necessidade real no futuro, ela deve ser avaliada como um novo campo separado, em vez de ser derivada dos três campos acima.

## Guia de Configuração do Usuário – Como Modificar

### Visão Geral dos Limites

Cada personalização de banner está sujeita a estes conjuntos de limites. Antes de escrever arte manualmente, revise-os para evitar que o analisador trunque ou rejeite silenciosamente.

| Item                         | Limite Superior                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Número de caracteres do título** | **80 caracteres no máximo** (contagem após limpeza). Excedido, trunca e emite um aviso `[BANNER]`. Caracteres de nova linha e controle são removidos antes da contagem. |
| **Número de caracteres do subtítulo** | **160 caracteres no máximo** (contagem após limpeza). Pipeline de limpeza idêntica ao título; se excedido, trunca e também emite aviso `[BANNER]`. |
| **Tamanho do bloco de arte ASCII** | **Limite de 200 linhas × 200 colunas por nível**. Excedido, trunca e emite aviso `[BANNER]`. |
| **Tamanho do arquivo de arte ASCII** | **64 KB no máximo**. Se o arquivo for maior que o limite, apenas os bytes dentro do limite são lidos; o restante é ignorado. |
| **Largura real renderizável da arte ASCII** | Determinada pelo número de colunas do terminal inicial, **não um número fixo de caracteres**. A fórmula específica e os valores disponíveis para várias larguras de terminal estão na seção "Quão grande o Logo pode ser? – Orçamento de largura" abaixo. |

A arte ASCII **não tem limite fixo de número de caracteres** – apenas os limites rígidos de colunas/linhas acima e o orçamento de largura calculado com base nas colunas do terminal na inicialização. O mesmo nome de marca de 17 caracteres, com fontes diferentes, se pode ser renderizado em uma única linha depende da largura visual, não do número de letras.

### Local de Armazenamento da Configuração

As quatro configurações estão todas localizadas no nó `ui` do `settings.json`. Suporta tanto níveis de usuário (`~/.qwen/settings.json`) quanto de workspace (`.qwen/settings.json` na raiz do projeto), com a prioridade de mesclagem padrão (workspace sobrescreve user, system sobrescreve workspace).

`customAsciiArt` é um caso especial: o analisador não substitui todo o objeto como um único valor pelo escopo de maior prioridade. Em vez disso, ele percorre todos os escopos por nível (tier). Se a configuração do usuário define `{ small }` e a configuração do workspace define `{ large }`, ambos entram em vigor – `small` vem do usuário, `large` vem do workspace. Isso atende a dois requisitos simultaneamente:

1. Cada item `{ path }` é resolvido em relação ao arquivo onde foi declarado (workspace `.qwen/` vs. user `~/.qwen/`); apenas visualizar a visão mesclada perderia a informação do escopo.
2. O usuário pode manter o nível `large` padrão em suas configurações pessoais e substituir apenas o `small` por workspace, sem precisar reescrever todo o objeto a cada vez.

Se o mesmo nível for definido em vários escopos, a prioridade normal ainda se aplica (system > workspace > user). Quando `customAsciiArt` é definido como uma única string ou `{ path }` em qualquer escopo, ele ainda preenche ambos os níveis desse escopo.

### Ocultar o Banner Completamente

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

A saída de inicialização pulará a coluna do Logo e o painel de informações. A menos que `ui.hideTips` também esteja definido, as Dicas ainda serão exibidas.

### Substituir o Título da Marca

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

O painel de informações renderizará `Acme CLI (vX.Y.Z)`. Após definir um título personalizado, os caracteres `>_` não serão incluídos por padrão; se desejar mantê-los, escreva-os explicitamente: `"customBannerTitle": ">_ Acme CLI"`.

### Adicionar um Subtítulo da Marca

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

O subtítulo aparecerá em uma linha separada com a cor de texto secundária, **substituindo** a linha de espaçamento em branco padrão (ou seja, a linha que originalmente ficava entre o título e a linha de autenticação/modelo):

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Título
│ Built-in DataWorks Official Skills                      │  ← B② Subtítulo
│ Qwen OAuth | qwen-coder ( /model alternar)              │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Caminho
└─────────────────────────────────────────────────────────┘
```

Restrições:

- Apenas uma única linha é permitida. Caracteres de nova linha e outros bytes de controle serão removidos/colapsados em espaços para evitar que acidentes de colagem rasguem o layout do painel de informações.
- Limite superior de 160 caracteres após a limpeza (mais generoso que o título – frases de subtítulo / "powered by" costumam ser mais longas que o nome da marca).
- Deixar vazio (ou definir como string vazia / somente espaços) = manter a linha de espaçamento padrão – compatibilidade retroativa é o comportamento padrão.
- O subtítulo não altera o comportamento da linha de bloqueio; autenticação, modelo e diretório de trabalho permanecem sempre visíveis, independentemente do estado do subtítulo.

### Substituir a Arte ASCII – String Inline

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Use `\n` na string JSON para representar quebras de linha. Esta arte ASCII aplicará a cor gradiente do tema atual, assim como o Logo padrão.

> **Não tem arte ASCII à mão?** Qualquer gerador externo serve; cole o resultado diretamente. O caminho mais simples é `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`, depois aponte `customAsciiArt: { "path": "./brand.txt" }` para o arquivo. A CLI **não** renderizará texto em arte ASCII em tempo de execução – motivo abaixo em "Fora do escopo deste design".

### Substituir a Arte ASCII – Arquivo Externo

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Evite escapar grandes blocos de texto multilinha no JSON. Regras de resolução de caminho:

- **Configuração de workspace**: caminhos relativos são relativos ao diretório `.qwen/` do workspace.
- **Configuração de usuário**: caminhos relativos são relativos a `~/.qwen/`.
- Caminhos absolutos são usados diretamente.
- O arquivo é **lido apenas uma vez na inicialização**, limpo e armazenado em cache. Modificações no arquivo durante a sessão não serão refletidas – reinicie a CLI.

### Substituir a Arte ASCII – Adaptação de Largura

```jsonc
{
  "ui": {
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

Quando o terminal é largo o suficiente, `large` é usado preferencialmente; caso contrário, `small` é usado; se nenhum couber, a coluna do Logo é ocultada (aplicando a estratégia de fallback de duas colunas atual). `small` e `large` podem ser tanto strings quanto `{ path }`. Qualquer nível pode ser omitido: quando ausente, passa para o próximo nível.

### Quão grande o Logo pode ser? – Orçamento de largura

Tanto o título quanto a arte não têm um "limite rígido de número de caracteres", apenas um **orçamento de largura** determinado pelo número de colunas do terminal, além dos limites rígidos absolutos para evitar que entradas malformadas congelem o layout:

| Item                                 | Limite Superior                                    |
| ------------------------------------ | -------------------------------------------------- |
| Colunas do terminal na inicialização | O que o terminal do usuário reportar.              |
| Margem externa do contêiner          | 4 colunas (2 esquerda + 2 direita).                |
| Espaçamento entre coluna do Logo e painel de informações | 2 colunas.                                          |
| Largura mínima do painel de informações | 44 colunas (40 caminho + bordas + padding).         |
| **Largura disponível para renderização da arte por nível** | `colunas do terminal − 4 − 2 − 44 = colunas do terminal − 50`. |
| Limite rígido pós-limpeza para arte de um nível | 200 colunas × 200 linhas. Se excedido, trunca e emite aviso `[BANNER]`. |
| Limite rígido pós-limpeza para `customBannerTitle` | 80 caracteres. Se excedido, trunca e emite aviso `[BANNER]`. |

Limites máximos do logo para larguras comuns de terminal:

| Colunas do terminal | Largura máxima renderizável do logo | O que significa na prática                          |
| -------------------- | ----------------------------------- | --------------------------------------------------- |
| 80                   | 30                                  | A maioria das letras do figlet "ANSI Shadow" tem 7–11 colunas, no máximo 3 letras. |
| 100                  | 50                                  | ANSI Shadow cabe uma palavra curta (cerca de 6 letras) ou duas palavras empilhadas. |
| 120                  | 70                                  | Arte com palavras empilhadas em múltiplas linhas é suficiente. |
| 200                  | 150                                 | Uma string longa em linha única (ex.: ANSI Shadow do nome completo do produto) também cabe. |
Duas regras práticas ao projetar art:

1. **Nomes de marca com várias palavras geralmente não cabem em uma linha no ANSI Shadow na maioria dos terminais.**  
   O ANSI Shadow ocupa cerca de 7 a 9 colunas por letra. Mesmo um nome de marca como `Custom Agent`, com 12 caracteres, exigiria aproximadamente 95 colunas de art em uma única linha — um terminal de 100 colunas já não é suficiente depois de acomodar o painel de informações. Ou você quebra as palavras em várias linhas, ou escolhe uma fonte figlet mais estreita, ou usa uma decoração compacta de linha única, como `▶ Custom Agent ◀`.

2. **Quando um único banner precisa ficar bonito em tela larga e não quebrar em tela estreita, use a forma adaptável de largura `{ small, large }`.**  
   No exemplo abaixo, `large` é a arte multilinha empilhada para terminais ≥ 104 colunas, `small` é uma decoração de linha única com 16 colunas. Se a largura for muito estreita para ambos, a coluna do logo é ocultada.

```jsonc
{
  "ui": {
    "customBannerTitle": "Custom Agent",
    "customAsciiArt": {
      "small": "▶ Custom Agent ◀",
      "large": { "path": "./banner-large.txt" },
    },
  },
}
```

O arquivo `banner-large.txt` contém a saída empilhada do ANSI Shadow (aproximadamente 54 colunas × 12 linhas), que pode ser gerada com o comando abaixo:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinação tripla

```jsonc
{
  "ui": {
    "hideBanner": false,
    "customBannerTitle": "Acme CLI",
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

### Como verificar

1. Salve `settings.json` e reinicie o `qwen` — a análise do banner é executada apenas uma vez na inicialização.
2. Ajuste a largura do terminal e confirme que a alternância entre `small` e `large` ocorre conforme o esperado. Em larguras muito estreitas, a coluna do logo deve ser ocultada corretamente.
3. Se o resultado não corresponder ao esperado, consulte `~/.qwen/debug/<sessionId>.txt` (o link simbólico `latest.txt` aponta para a sessão atual) e procure por `[BANNER]` — cada falha suave gera uma linha de aviso explicando o motivo.

## Pipeline de análise

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "Built-in …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   merge user / workspace                customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. Normaliza para       │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Analisa cada nível:  │           │
   │    string → usa direto   │           │  Seleciona o nível com base em
   │    {path} → fs.read     │           │  availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │          Renderiza a coluna do Logo
   │ 3. Limpa a arte:        │          Renderiza o painel de informações:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 linhas × 200 col│                   ?? '>_ Qwen Code'
   │ 4. Limpa título +        │           Subtitle = customBannerSubtitle
   │    subtítulo (linha única,│                   ?? linha de espaço em branco
   │    ≤ 80 / 160 caracteres)│           Status   = fixo
   │ 5. Memoiza por origem    │           Path     = fixo
   └─────────────────────────┘
```

O algoritmo de análise em cinco etapas é executado uma vez ao carregar as configurações, e novamente apenas quando um evento de recarga a quente das configurações é disparado:

1. **Normalização**. Uma `string` simples ou `{ path }` é convertida para `{ small: x, large: x }`. O objeto `{ small, large }` é mantido como está.
2. **Análise por nível**. Para cada `AsciiArtSource`:
   - String: usada diretamente.
   - `{ path }`: leitura síncrona, com `O_NOFOLLOW` para prevenir sequestro de link simbólico (no Windows, degrada para uma leitura apenas de leitura comum — essa constante não é exposta), limite de 64 KB. Caminhos relativos são relativos ao *diretório do arquivo de configuração*: configurações do workspace relativas ao `.qwen/` do workspace, configurações do usuário relativas a `~/.qwen/`. Falha na leitura → aviso `[BANNER]`, esse nível volta ao padrão.
3. **Limpeza**. Um stripper específico para banner: remove caracteres de escape OSC / CSI / SS2 / SS3, substitui outros bytes de controle C0 / C1 (incluindo DEL) por espaços, mantendo `\n` para que a arte ASCII de várias linhas sobreviva. Após cortar espaços em branco à direita em cada linha, trunca para 200 linhas × 200 colunas; o que exceder é truncado e um aviso `[BANNER]` é emitido.
4. **Seleção do nível durante a renderização**. No `Header.tsx`, dados os níveis `small` e `large` analisados, com base no orçamento de largura disponível (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Se `large` couber, usa `large` em primeiro lugar.
   - Caso contrário, se `small` couber, cai para `small`.
   - Caso contrário, **se o usuário forneceu arte personalizada**, oculta diretamente a coluna do Logo (segue o ramo `showLogo = false`) — neste ponto, voltar ao logo QWEN embutido quebraria silenciosamente a implantação de marca branca em terminais estreitos. O painel de informações continua sendo renderizado.
   - Caso contrário (o usuário não forneceu arte personalizada), cai para `shortAsciiLogo`, que é controlado pela porta de largura do logo padrão.
5. **Fallback**. Se ambos os níveis ficaram vazios ou inválidos devido a falhas suaves (arquivo ausente, arte vazia após limpeza, configuração malformada), renderiza como não personalizado, usando `shortAsciiLogo` e tratando pela porta de largura do logo padrão. A **CLI nunca deve falhar** devido a configuração incorreta do banner.

Pseudocódigo para seleção de nível:

```ts
function pickTier(
  small: string | undefined,
  large: string | undefined,
  availableWidth: number,
  logoGap: number,
  minInfoPanelWidth: number,
): string | undefined {
  for (const candidate of [large, small]) {
    if (!candidate) continue;
    const w = getAsciiArtWidth(candidate);
    if (availableWidth >= w + logoGap + minInfoPanelWidth) {
      return candidate;
    }
  }
  return undefined; // Oculta a coluna do Logo
}
```

## Novos itens no esquema de configurações

No arquivo `packages/cli/src/config/settingsSchema.ts`, dentro do objeto `ui`, imediatamente após `shellOutputMaxLines`, adicione quatro propriedades:

```ts
hideBanner: {
  type: 'boolean',
  label: 'Hide Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Hide the startup ASCII banner and info panel.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Custom Banner Title',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Replace the default ">_ Qwen Code" title shown in the banner info panel. The version suffix is always appended.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Custom Banner Subtitle',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optional subtitle line rendered between the banner title and the auth/model line. When unset, the info panel keeps its blank spacer row.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Custom ASCII Art',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Replace the default QWEN ASCII art. Accepts an inline string, {"path": "..."}, or {"small": ..., "large": ...} for width-aware selection.',
  showInDialog: false,
  // Aceita formas de união em tempo de execução que o tipo `type` da SettingDefinition
  // não consegue expressar.
  // O override é passado diretamente pelo gerador de esquema JSON, permitindo que o VS Code
  // aceite todas as formas documentadas (string, {path}, {small,large}) sem marcar
  // strings simples como erro.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```
`hideBanner` segue o mesmo padrão de `hideTips` (com `showInDialog: true`);
os outros três campos de texto livre (título, subtítulo, arte ASCII) **não** entram na caixa de diálogo de configurações do aplicativo —
fazer um editor ASCII multilinha dentro da caixa de diálogo TUI é outro projeto; usuários avançados podem editar diretamente
o `settings.json`.

## Pontos de alteração no código

As alterações de implementação são muito pequenas. Abaixo estão os arquivos e as faixas de linha no branch `main` atual para cada ponto.

`packages/cli/src/ui/components/AppHeader.tsx:53` — estende
`showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — passa os dados
do banner resolvido para `<Header>`:

```tsx
<Header
  version={version}
  authDisplayType={authDisplayType}
  model={model}
  workingDirectory={targetDir}
  customAsciiArt={resolvedBanner?.asciiArt /* { small?, large? } */}
  customBannerTitle={resolvedBanner?.title /* string | undefined */}
  customBannerSubtitle={resolvedBanner?.subtitle /* string | undefined */}
/>
```

`packages/cli/src/ui/components/Header.tsx` — estende `HeaderProps`:

```ts
interface HeaderProps {
  customAsciiArt?: { small?: string; large?: string };
  customBannerTitle?: string;
  customBannerSubtitle?: string;
  version: string;
  authDisplayType?: AuthDisplayType;
  model: string;
  workingDirectory: string;
}
```

`packages/cli/src/ui/components/Header.tsx:45-46` — antes de calcular
`logoWidth`, faz a seleção com fallback para o padrão existente:

```ts
const tier = pickTier(
  customAsciiArt?.small,
  customAsciiArt?.large,
  availableTerminalWidth,
  logoGap,
  minInfoPanelWidth,
);
const displayLogo = tier ?? shortAsciiLogo;
```

`packages/cli/src/ui/components/Header.tsx` — o título é renderizado a partir da prop,
o subtítulo substitui a linha de espaçamento em branco quando a prop é verdadeira:

```tsx
<Text bold color={theme.text.accent}>
  {customBannerTitle ? customBannerTitle : '>_ Qwen Code'}
</Text>
…
{customBannerSubtitle ? (
  <Text color={theme.text.secondary}>{customBannerSubtitle}</Text>
) : (
  <Text> </Text>
)}
```

**Arquivo novo**: `packages/cli/src/ui/utils/customBanner.ts` — resolvedor.
Interface externa:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

O resolvedor é responsável pela normalização, leitura de arquivos, sanitização e cache descritos no "pipeline de resolução" acima.
É chamado uma vez na inicialização do CLI e novamente em eventos de hot‑reload de configurações. Os caminhos de arquivo para cada escopo
vêm diretamente de `settings.system.path` / `settings.workspace.path` /
`settings.user.path`; portanto, cada `{ path }` é resolvido relativamente ao arquivo
que o declarou. Quando `settings.isTrusted` é `false`, o escopo workspace é pulado por completo.

## Comparação de alternativas

Abaixo estão as 5 formas que foram avaliadas, para que mantenedores futuros conheçam o espaço de design e possam reavaliar se necessário.

### Opção 1 — Três campos planos (recomendada, idêntica à issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Efeito**: mínima superfície para o usuário, mapeamento 1:1 com a descrição da issue.
- **Vantagens**: custo zero de aprendizado; documentação muito fácil; consistente com outros campos planos de `ui.*`
  (`hideTips`, `customWittyPhrases`, etc.).
- **Desvantagens**: três chaves semanticamente relacionadas espalhadas no topo de `ui`; no futuro, se houver novas opções
  exclusivas do banner (gradiente, subtítulo, etc.), só poderão ser adicionadas como campos irmãos, sem agrupamento natural.

### Opção 2 — Namespace `ui.banner` aninhado

```jsonc
{
  "ui": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "asciiArt": { "path": "./brand.txt" },
    },
  },
}
```

- **Efeito**: capacidade igual à opção 1, mas agregada por funcionalidade.
- **Vantagens**: namespace limpo para futuras opções exclusivas do banner; melhor descoberta em `/settings`.
- **Desvantagens**: não segue exatamente a redação da issue; as configurações de UI existentes são predominantemente planas
  (apenas `ui.accessibility` e `ui.statusLine` são aninhadas), o que prejudica a consistência; uma camada extra para o usuário memorizar.

### Opção 3 — Perfil de banner predefinido + substituição por slot

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* substituições de slot no perfil 'branded' */ }
  }
}
```

- **Efeito**: o usuário escolhe entre predefinições nomeadas; usuários avançados podem substituir slots específicos na predefinição escolhida.
- **Vantagens**: melhor experiência de onboarding; as predefinições podem vir embutidas no CLI.
- **Desvantagens**: complexidade aumenta significativamente; predefinições são um compromisso de manutenção de longo prazo; a issue pede
  customização aberta, não curadoria de conteúdo.

### Opção 4 — Template string de banner inteiro

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Efeito**: template livre único, com interpolação de campos fixos.
- **Vantagens**: máxima flexibilidade para layouts não padrão.
- **Desvantagens**: transfere a responsabilidade de layout para o usuário; a coluna dupla do Ink perde robustez em relação à largura do terminal;
  facilmente se cria um template que quebra em terminais estreitos; abre uma grande superfície de dano para um ganho pequeno.

### Opção 5 — Plugin / Hook API

Expor um hook de renderização de banner através do sistema de extensões.

- **Efeito**: customização em nível de código; extensões podem renderizar qualquer conteúdo.
- **Vantagens**: máximo teto de capacidade; empresas podem empacotar plugins de marca completos.
- **Desvantagens**: superfície de API enorme; renderização arbitrária no terminal precisa de revisão de segurança; completamente over‑engineering para esta issue.

### Conclusão da recomendação

**Adotar a Opção 1**. Ela atende diretamente à issue, é consistente com o estilo existente de `ui.*` e não nos prende a um namespace
antes de sabermos se mais opções exclusivas do banner virão. Se no futuro os campos irmãos começarem a se acumular, a migração para a
Opção 2 é aditiva — `ui.banner.title` e `ui.customBannerTitle` podem coexistir durante um período de depreciação.

## Segurança e tratamento de falhas

O conteúdo do banner customizado é **renderizado literalmente no terminal** e, no caso da forma `path`, também é **lido do disco**.
Ambos os caminhos são acessíveis quando configurações maliciosas ou adulteradas são carregadas. O mesmo modelo de ameaça já tratado
pela funcionalidade de título de sessão se aplica aqui.

| Ponto de atenção                                                      | Medida de proteção                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injeção de ANSI / OSC-8 / CSI na arte ASCII / título / subtítulo      | Removedor específico para banner (`sanitizeArt` / `sanitizeSingleLine`): remove sequências OSC / CSI / SS2 / SS3, substitui os demais bytes de controle C0/C1 (incluindo DEL) por espaços. Aplicado antes da renderização e da escrita no cache. |
| Congelamento da inicialização por arquivo grande                      | Limite máximo de leitura de arquivo: 64 KB.                                                                                                                                                          |
| Congelamento do layout por arte ASCII patológica                      | Cada resultado resolvido tem limite de 200 linhas × 200 colunas; acima disso, truncamento + aviso `[BANNER]`.                                                                                        |
| Ataque de link simbólico na forma `path`                              | Leitura de arquivo usa `O_NOFOLLOW` (no Windows, degrada para somente leitura; constante não exposta).                                                                                               |
| Arquivo ausente ou ilegível                                           | Captura → aviso `[BANNER]` → fallback para o padrão; nunca propaga exceção para a UI.                                                                                                                |
| Título / subtítulo contém quebras de linha ou é muito longo           | Quebras de linha substituídas por espaços, truncamento em 80 (título) / 160 (subtítulo) caracteres.                                                                                                  |
| Workspace não confiável afeta renderização ou leitura de arquivo      | Quando `settings.isTrusted` é `false`, o resolvedor pula o `settings.workspace` por completo (consistente com a trava de confiança na visão `settings.merged`).                                      |
| Condição de corrida no hot‑reload de configurações                    | O resultado da resolução é memoizado por chamada por origem (path ou string); um reload executa o resolvedor novamente e relê os arquivos afetados.                                                   |
Resumo dos padrões de falha: todas as falhas suaves acabam caindo em `shortAsciiLogo` (ou no título padrão bloqueado) + uma linha de log de depuração warn. Nenhum ramo pode gerar uma falha dura (lançar exceção para cima).

## Fora do escopo deste design

Os itens a seguir foram intencionalmente excluídos. Cada um pode ser tratado em propostas separadas no futuro, conforme feedback dos usuários.

| Item                                                                                             | Motivo para não fazer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversão de texto para ASCII art (forma `{ text: "xxxCode" }`)                                  | **Rejeitado** após avaliação da v1. Ou se introduz a dependência de runtime `figlet` (~2–3 MB descompactado com um conjunto de fontes utilizáveis) ou se vendeia um renderizador de fonte única (~200 linhas de código + um arquivo de fonte `.flf` que mantemos). Ambos os caminhos trazem superfície de manutenção de longo prazo: seleção de fontes, auditoria de licenças de fontes, issues do tipo "minha fonte não renderiza corretamente no terminal X", tratamento de caracteres CJW / largura total. O caso de uso condutor dessa funcionalidade (white-label / multi-inquilino) quase sempre terá uma arte ASCII finalizada entregue pelo designer, não dependerá de fontes padrão do figlet. Usuários que desejam gerar com um comando hoje podem usar `npx figlet "xxxCode" > brand.txt` e `customAsciiArt: { "path": "./brand.txt" }` — efeito equivalente, zero novas dependências, zero carga interna de suporte do Qwen Code. Se a demanda crescer no futuro, essa forma é puramente aditiva: estender `AsciiArtSource` para `string \| {path} \| {text, font?}` não quebrará nenhuma configuração existente. |
| Edição online via comando slash `/banner`                                                         | A interface de configuração já é a entrada normalizada para edição; um editor online de ASCII multilinha é outro projeto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Gradiente personalizado / cor de linha única                                                      | A cor é de propriedade do tema. Se houver necessidade de extensão, deve-se abrir uma proposta separada; a personalização do Banner não reinventa esse aspecto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Carregar ASCII art via URL                                                                        | Requisições de rede durante a inicialização trazem uma série de problemas: modos de falha, cache, revisão de segurança. O carregamento de arquivo `{path}` é um equivalente de baixo risco.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Animações (logotipo giratório, título em rolagem)                                                | Aumentam a carga de renderização e problemas de acessibilidade; o caso de uso desta funcionalidade não as exige.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Alinhamento de banner no VSCode / Web UI                                                          | Atualmente esses dois ambientes não renderizam o Ink Banner. Se no futuro o fizerem, este design serve como referência.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Recarga dinâmica ao alterar arquivo                                                               | O parser só roda na inicialização e no recarregamento de configuração. A necessidade de trocar a arte durante a sessão é rara; "reiniciar para aplicar" é um compromisso aceitável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Ocultar individualmente a área bloqueada (version / auth / model / path)                          | Estes são sinais de runtime; ocultá-los prejudica mais o suporte e a postura de segurança do que os benefícios para cenários de white-label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
## Plano de Verificação

Os PRs de implementação subsequentes devem passar pelas seguintes verificações de ponta a ponta:

1. Configurar `customBannerTitle: "Acme CLI"` em `~/.qwen/settings.json`
   junto com um `customAsciiArt` inline → ao iniciar `qwen`, o novo título e o novo
   ASCII art são exibidos; o sufixo da versão ainda está presente.
2. Configurar `customBannerSubtitle: "Built-in Acme Skills"` → a linha de subtítulo
   aparece com cor de texto secundária entre o título e a linha de autenticação / modelo; autenticação, modelo
   e caminho ainda são visíveis. Após desmarcar, volta a ser uma linha vazia de espaçamento (compatibilidade com versões anteriores).
3. Configurar `hideBanner: true` → `qwen` inicia sem banner; Dicas e corpo
   são renderizados normalmente.
4. Configurar `customAsciiArt: { "path": "./brand.txt" }` no `settings.json` do workspace,
   com `brand.txt` no diretório `.qwen/` → ao abrir o workspace, carrega do disco.
5. `customAsciiArt: { "small": "...", "large": "..." }` →
   redimensionar o terminal entre largura ampla / média / estreita; na largura ampla usa `large`,
   na média usa `small`, na estreita oculta a coluna do logotipo; o painel de informações permanece sempre visível.
6. Injetar `\x1b[31mhostile` em `customBannerTitle` **e** em `customBannerSubtitle` →
   ambos são renderizados como texto literal, não interpretados como vermelho.
7. `path` aponta para um arquivo inexistente → a CLI inicia normalmente;
   em `~/.qwen/debug/<sessionId>.txt` aparece um aviso `[BANNER]`;
   renderiza a arte padrão.
8. Abrir uma worktree com a confiança do workspace desativada → o `customAsciiArt` fornecido
   pelo workspace (incluindo o item `{ path }`) é silenciosamente ignorado;
   as configurações do escopo do usuário ainda têm efeito.

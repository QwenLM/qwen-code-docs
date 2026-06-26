# Design de Personalização da Área do Banner

> Permite que os usuários substituam o logotipo ASCII QWEN, troquem o título da marca e ocultem totalmente o banner —
> mas não permite remover as informações de tempo de execução necessárias para solução de problemas e confiabilidade (número da versão, método de autenticação, modelo,
> diretório de trabalho).

## Visão Geral

Quando o Qwen Code CLI é iniciado, ele imprime um banner no topo do terminal, contendo o logotipo ASCII QWEN
e um painel de informações com borda. Vários cenários reais exigem controle sobre essa área:

- **White-label / Integração de marca de terceiros**: Ao incorporar o Qwen Code em um produto próprio da empresa ou equipe,
  é necessário exibir a própria marca em vez do "Qwen Code" padrão.
- **Personalização**: Usuários individuais desejam que o banner do terminal esteja alinhado com as diretrizes da equipe ou com seu gosto pessoal.
- **Diferenciação multi-inquilino / multi-instância**: Em ambientes compartilhados, diferentes equipes desejam identificar rapidamente
  qual instância estão usando.

A posição de design é muito simples: **a aparência da marca pode ser substituída; as informações de tempo de execução não podem ser substituídas**.
A personalização permite apenas que os usuários sobreponham sua própria marca, **não** permite ocultar informações críticas para solução de problemas.
Cada julgamento de "pode alterar / não pode alterar" neste documento deriva dessa posição.

Issue correspondente: [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Divisão da Área do Banner

O banner atual é renderizado por `Header` (montado por `AppHeader`), e pode ser dividido da seguinte forma:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Coluna do Logotipo ─────┐  gap=2  ┌──── Painel de Informações (com borda) ─────┐  │
│   │                             │         │                                            │  │
│   │  ███ QWEN ASCII ███        │         │  ① Título:    >_ Qwen Code (vX.Y.Z)        │  │
│   │  ███   ART ART  ███        │         │  ② Subtítulo: «Linha em branco / substituição personalizada» │  │
│   │  ███ QWEN ASCII ███        │         │  ③ Status:    Qwen OAuth | qwen-…           │  │
│   │                             │         │  ④ Caminho:    ~/projects/example           │  │
│   └──────── A ──────────────────┘         └──────────────── B ─────────────────────────┘  │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
                              Responsabilidade da área: AppHeader
                         │ Componente Tips renderizado abaixo (controlado por ui.hideTips) │
```

Dois blocos de nível superior:

- **A. Coluna do Logotipo** — bloco único de arte ASCII com gradiente.
  Fonte atual: `shortAsciiLogo` em `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Painel de Informações** — caixa de informações com borda, totalizando quatro linhas. A segunda linha é, por padrão, um espaçador visual em branco,
  opcionalmente alternado para um subtítulo fornecido pelo chamador:
  - **B① Título**: `>_ Qwen Code (vX.Y.Z)` — texto da marca + sufixo de versão.
  - **B② Subtítulo / espaçador**: por padrão, uma linha de espaço único; quando `ui.customBannerSubtitle` está definido, renderiza uma string de subtítulo de linha única limpa (por exemplo, um fork pode usar
    `Built-in DataWorks Official Skills`).
  - **B③ Status**: `<Tipo de exibição de autenticação> | <Modelo> (alternância /model)`.
  - **B④ Caminho**: diretório de trabalho após tildeify e encurtamento.

O componente externo `<AppHeader>` já oculta completamente o banner quando o modo leitor de tela está ativo, com base em `showBanner = !config.getScreenReader()`.
(No modo leitor de tela, a saída é texto simples.)

## Regras de Personalização — O Que Pode Ser Alterado, O Que Está Bloqueado

| Área                               | Fonte Atual                           | Categoria de Personalização | Motivo do Bloqueio/Liberação                                                                                                                                                              |
| ---------------------------------- | ------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Coluna do Logotipo**          | `shortAsciiLogo` (`AsciiArt.ts`)      | **Substituível + Ocultável automaticamente** | Área puramente de marca. Cenários white-label precisam de controle total sobre a parte visual. O comportamento existente de "ocultar automaticamente o logotipo" em terminais estreitos permanece inalterado. |
| **B①. Texto do Título** (`>_ Qwen Code`) | Codificado em `Header.tsx`           | **Substituível**            | Área de marca. O caractere `>_` inicial faz parte da marca existente; se não for desejado, o usuário pode omiti-lo em `customBannerTitle`.                                              |
| **B①. Sufixo da Versão** (`(vX.Y.Z)`)   | Propriedade `version`                | **Bloqueado**               | Essencial para suporte e solução de problemas. Ocultá-lo significaria que só seria possível responder "que versão você está usando?" através de `--version`, o que é um custo real para o fluxo de suporte. Trocamos uma pequena perda de experiência de white-label pela acessibilidade do suporte. |
| **B②. Linha de Subtítulo / Espaçador**  | Linha em branco padrão               | **Substituível**            | Área puramente de marca/contexto. Forks white-label a usam para marcar a versão da build (ex.: "Built-in DataWorks Official Skills"). Regras de limpeza idênticas às do título; apenas uma linha é permitida, sem quebras de linha que quebrem o layout. |
| **B③. Linha de Status** (Autenticação + Modelo) | `formattedAuthType`, propriedade `model` | **Bloqueado**                | Sinal operacional e de segurança. O usuário deve ver as credenciais atuais e o modelo que realmente consome tokens. Qualquer ocultação/substituição é um risco, mesmo em cenários white-label. |
| **B④. Linha de Caminho** (Diretório de trabalho) | Propriedade `workingDirectory`      | **Bloqueado**                | Informação operacional. "Em qual diretório estou agora?" é uma pergunta frequente; o banner é sua única fonte autoritativa.                                                              |
| **Banner Inteiro** (A + B)         | Ponto de montagem `<Header>` em `AppHeader.tsx` | **Ocultável**               | Um `ui.hideBanner: true` pula os blocos A e B simultaneamente — mesma forma que o switch de modo leitor de tela existente. `<Tips>` ainda é controlado pelo `ui.hideTips` independente. |

A matriz acima corresponde a quatro configurações, apenas essas:

| Configuração                    | Valor Padrão | Efeito                                                                                                 | Área Afetada     |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | ---------------- |
| `ui.hideBanner`                 | `false`      | Oculta todo o banner (áreas A + B).                                                                      | A + B            |
| `ui.customBannerTitle`          | não definido | Substitui o texto da marca em B①. O sufixo da versão é anexado normalmente. Será feito trim; string vazia = usa o padrão. | B① Texto da marca |
| `ui.customBannerSubtitle`       | não definido | Substitui o espaçador em branco de B② por uma linha de subtítulo. Será limpo; limite de 160 caracteres; string vazia = mantém o espaçador em branco (compatibilidade retroativa). | B② Espaçador |
| `ui.customAsciiArt`             | não definido | Substitui a área A. Suporta três formas de dados (veja abaixo). Qualquer erro retorna ao padrão.       | A                |

**Capacidades intencionalmente não fornecidas**:

- Não há opção para "ocultar apenas o sufixo da versão".
- Não há opção para "ocultar apenas a linha de autenticação/modelo".
- Não há opção para "ocultar apenas a linha de caminho".
- Não há entrada para modificar a cor do gradiente do logotipo (a cor é de responsabilidade do tema).
- Não há capacidade de ajustar a ordem ou estrutura do painel de informações.

Se houver demanda futura, isso deve ser tratado como novos campos, passando por avaliação de design separada, e não derivado dos três campos acima.

## Guia de Configuração para o Usuário — Como Modificar

### Visão Geral dos Limites

Toda personalização de banner está sujeita a esses limites. Leia antes de criar arte manualmente, para evitar que o parser corte ou rejeite silenciosamente.

| Item                         | Limite Máximo                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Caracteres do Título**     | **Limite de 80 caracteres** (contados após limpeza). Se exceder, será truncado e um warn `[BANNER]` será emitido. Caracteres de controle e quebras de linha são removidos antes da contagem. |
| **Caracteres do Subtítulo**  | **Limite de 160 caracteres** (contados após limpeza). Pipeline de limpeza igual ao título; se exceder, também emite warn `[BANNER]`. |
| **Tamanho do bloco de arte ASCII** | **Limite de 200 linhas × 200 colunas**. Se exceder, será truncado e um warn `[BANNER]` será emitido. |
| **Tamanho do arquivo de arte ASCII** | **Limite de 64 KB**. Se o arquivo for maior que o limite, apenas os bytes dentro do limite serão lidos, o restante ignorado. |
| **Largura renderizável real da arte ASCII** | Determinada pelo número de colunas do terminal na inicialização, **não um número fixo de caracteres**. A fórmula específica e os valores disponíveis para várias larguras de terminal estão na seção "Qual o tamanho máximo do logotipo? — Orçamento de largura" abaixo. |

A arte ASCII **não tem limite fixo de número de caracteres** — apenas os limites rígidos de colunas/linhas acima e o orçamento de largura calculado com base no número de colunas do terminal na inicialização. Para um mesmo nome de marca de 17 caracteres, se ele pode ser renderizado em uma única linha depende da largura visual da fonte, não do número de letras.

### Localização da Configuração

As quatro configurações estão todas localizadas no nó `ui` do `settings.json`. Suportam tanto o nível do usuário (`~/.qwen/settings.json`) quanto o nível do workspace (`.qwen/settings.json` na raiz do projeto), seguindo a prioridade de mesclagem padrão (workspace sobrescreve user, system sobrescreve workspace).

`customAsciiArt` é uma exceção: o parser não trata o objeto inteiro como um valor que é substituído diretamente pelo escopo de maior prioridade. Em vez disso, ele percorre todos os escopos por tier. Se a configuração do usuário define `{ small }` e a configuração do workspace define `{ large }`, ambos entram em vigor —
`small` vem do usuário, `large` do workspace. Isso atende a duas necessidades simultaneamente:

1. Cada item `{ path }` é resolvido relativamente ao diretório do arquivo que o declara (workspace `.qwen/` vs. user `~/.qwen/`); se olhássemos apenas para a visão mesclada, perderíamos a informação do escopo.
2. O usuário pode manter o tier `large` padrão em suas configurações pessoais, e sobrescrever apenas o `small` no workspace, sem precisar reescrever o objeto inteiro a cada vez.

Se o mesmo tier for definido em vários escopos, a prioridade normal se aplica (system > workspace > user). Quando `customAsciiArt` é definido como uma string simples ou `{ path }` em qualquer escopo, ele ainda preenche ambos os tiers desse escopo.

### Ocultar o Banner Inteiramente

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

A saída de inicialização pulará a coluna do logotipo e o painel de informações. A menos que `ui.hideTips` também seja definido, as dicas (Tips) ainda serão exibidas.

### Substituir o Título da Marca

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

O painel de informações renderizará `Acme CLI (vX.Y.Z)`. Após definir um título personalizado, o caractere `>_` não será incluído por padrão; para mantê-lo, escreva-o você mesmo:
`"customBannerTitle": ">_ Acme CLI"`.

### Adicionar um Subtítulo de Marca

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

O subtítulo aparecerá em uma linha separada com cor de texto secundária, **substituindo** a linha de espaçador em branco padrão (ou seja, a linha que originalmente fica entre o título e a linha de autenticação/modelo):

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Título
│ Built-in DataWorks Official Skills                      │  ← B② Subtítulo
│ Qwen OAuth | qwen-coder (alternância /model)            │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Caminho
└─────────────────────────────────────────────────────────┘
```

Restrições:

- Apenas uma linha é permitida. Caracteres de controle e outras sequências de controle serão removidos / dobrados em espaços, para evitar que quebras de linha acidentais rasguem o layout do painel de informações.
- Limite de 160 caracteres após limpeza (mais permissivo que o título — slogans secundários / "powered by" costumam ser mais longos que o nome da marca).
- Deixar em branco (ou definir como string vazia / espaços) = mantém a linha de espaçador em branco padrão — compatibilidade retroativa é o comportamento padrão.
- O subtítulo não altera o comportamento das linhas bloqueadas; autenticação, modelo e diretório de trabalho permanecem sempre visíveis, independentemente do estado do subtítulo.

### Substituir a Arte ASCII — String Inline

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Em strings JSON, use `\n` para representar quebras de linha. Essa arte ASCII receberá a cor gradiente do tema atual, assim como o logotipo padrão.

> **Não tem arte ASCII à mão?** Qualquer gerador externo serve, basta colar o resultado. O caminho mais simples é `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`, e então aponte `customAsciiArt: { "path": "./brand.txt" }` para o arquivo. O CLI **não** renderizará o texto como arte ASCII em tempo de execução — motivo explicado em "Fora do escopo deste design".

### Substituir a Arte ASCII — Arquivo Externo

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Evita escapar grandes strings multilinhas no JSON. Regras de resolução de caminho:

- **Configuração de workspace**: caminhos relativos são resolvidos em relação ao diretório `.qwen/` do workspace.
- **Configuração de usuário**: caminhos relativos são resolvidos em relação a `~/.qwen/`.
- Caminhos absolutos são usados diretamente.
- O arquivo é **lido apenas uma vez na inicialização**, limpo e armazenado em cache. Modificações no arquivo durante a sessão não serão refletidas — reinicie o CLI.

### Substituir a Arte ASCII — Adaptação de Largura

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

Quando o terminal é largo o suficiente, o `large` é preferido; caso contrário, usa `small`; se nenhum couber, a coluna do logotipo é ocultada (utilizando a estratégia de fallback de duas colunas atual). `small` e `large` podem ser cada um uma string ou `{ path }`. Qualquer tier pode ser omitido: quando ausente, cai para o próximo tier.

### Qual o Tamanho Máximo do Logotipo? — Orçamento de Largura

Nem o título nem a arte têm um "limite rígido de número de caracteres", apenas um **orçamento de largura** determinado pelo número de colunas do terminal, mais limites rígidos absolutos para evitar que entradas malformadas congelem o layout:

| Item                                 | Limite Máximo                                      |
| ------------------------------------ | -------------------------------------------------- |
| Colunas do terminal na inicialização | O que o terminal do usuário reportar.              |
| Margem externa do container          | 4 colunas (2 esquerda + 2 direita).                |
| Espaçamento entre coluna do logotipo e painel de informações | 2 colunas.              |
| Largura mínima do painel de informações | 44 colunas (40 caminho + borda + padding).         |
| **Largura disponível para renderização de cada tier de arte** | `Colunas do terminal − 4 − 2 − 44 = Colunas do terminal − 50`. |
| Limite rígido de largura e altura de cada tier de arte após limpeza | 200 colunas × 200 linhas. Se exceder, trunca e emite warn `[BANNER]`. |
| Limite rígido de `customBannerTitle` após limpeza | 80 caracteres. Se exceder, trunca e emite warn `[BANNER]`. |

Limites do logotipo para larguras comuns de terminal:

| Colunas do Terminal | Largura Máxima do Logotipo Renderizável | O que isso significa na prática                                           |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| 80                  | 30                                      | A maioria dos caracteres do figlet "ANSI Shadow" tem 7–11 colunas, máximo de 3 letras. |
| 100                 | 50                                      | Permite escrever uma palavra curta (cerca de 6 letras) ou duas palavras empilhadas no "ANSI Shadow". |
| 120                 | 70                                      | Arte empilhada com várias linhas de palavras é totalmente suficiente.     |
| 200                 | 150                                     | Cabe até mesmo uma string longa de linha única (ex.: "ANSI Shadow" de um nome de produto completo). |

Duas regras práticas ao projetar arte:

1. **Nomes de marca com várias palavras geralmente não podem ser renderizados em uma única linha com "ANSI Shadow" na maioria dos terminais.**
   "ANSI Shadow" ocupa cerca de 7–9 colunas por letra. Mesmo um nome de marca de 12 caracteres como `Custom Agent` exigiria cerca de 95 colunas de arte em uma linha — um terminal de 100 colunas já não é suficiente depois de colocar o painel de informações. Ou empilhe as palavras em linhas separadas, ou use uma fonte figlet mais estreita, ou use uma decoração compacta de linha única, como `▶ Custom Agent ◀`.
2. **Quando um único tier precisa ser "bom em telas largas" e "não quebrar em telas estreitas", use a forma de adaptação de largura `{ small, large }`**. No exemplo abaixo, `large` é uma arte empilhada multilinha para terminais com ≥ 104 colunas, `small` é uma decoração de linha única de 16 colunas; se nem isso couber, a coluna do logotipo é ocultada.

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

Em `banner-large.txt`, coloque a saída empilhada do "ANSI Shadow" (cerca de 54 colunas × 12 linhas), que pode ser gerada com o comando abaixo:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinando os Três Itens

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

### Como Validar

1. Salve o `settings.json`, reinicie o `qwen` — a análise do banner é executada apenas uma vez na inicialização.
2. Ajuste a largura do terminal e verifique se a alternância `small` / `large` funciona conforme o esperado e se, em larguras muito estreitas, a coluna do logotipo é ocultada corretamente.
3. Se o resultado não for o esperado, consulte
   `~/.qwen/debug/<sessionId>.txt` (o link simbólico `latest.txt` aponta para a sessão atual) e procure por `[BANNER]` — cada falha suave imprime uma linha de warn explicando o motivo.

## Pipeline de Análise

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
   │ 1. Normalizar para      │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Analisar cada tier:  │           │
   │    string → usar direto │           │  De acordo com availableTerminalWidth
   │    {path} → fs.read     │           │  selecionar o tier
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │          Renderizar coluna do logotipo
   │ 3. Limpar arte:         │          Renderizar painel de informações:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 linhas × 200 colunas │           ?? '>_ Qwen Code'
   │ 4. Limpar título +      │           Subtitle = customBannerSubtitle
   │    subtítulo (linha única, │           ?? Linha de espaçador em branco
   │    ≤ 80 / 160 caracteres) │           Status   = Bloqueado
   │ 5. Memoizar por fonte   │           Path     = Bloqueado
   └─────────────────────────┘
```

O algoritmo de análise de cinco etapas é executado uma vez ao carregar as configurações, e novamente apenas quando um evento de recarga a quente das configurações é disparado:

1. **Normalização**. Uma string simples ou `{ path }` é convertida para `{ small: x, large: x }`. O objeto `{ small, large }` é passado como está.
2. **Análise por tier**. Para cada `AsciiArtSource`:
   - String: usada diretamente.
   - `{ path }`: lida de forma síncrona, usando `O_NOFOLLOW` como proteção contra ataques de link simbólico (no Windows, recai para leitura somente leitura normal — a constante não está disponível), com limite de 64 KB.
     Caminhos relativos são resolvidos em relação ao *diretório do arquivo de configuração ao qual pertencem*: configuração de workspace relativa ao `.qwen/` do workspace, configuração de usuário relativa a `~/.qwen/`.
     Se a leitura falhar → warn `[BANNER]`, esse tier retorna ao padrão.
3. **Limpeza**. Stripper específico de banner: remove caracteres de escape OSC / CSI / SS2 / SS3, substitui outros bytes de controle C0 / C1 (incluindo DEL) por espaços, enquanto preserva `\n` para permitir arte ASCII multilinha. Após trim de espaços à direita de cada linha, trunca para 200 linhas × 200 colunas; se exceder, trunca e imprime warn `[BANNER]`.
4. **Seleção de tier em tempo de renderização**. Em `Header.tsx`, dados os `small` e `large` analisados, com base no orçamento de largura atual
   (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Se `large` couber, prefere `large`.
   - Caso contrário, se `small` couber, recai para `small`.
   - Caso contrário, **desde que o usuário tenha fornecido arte personalizada**, oculta a coluna do logotipo (usando o ramo `showLogo = false` existente) — recuar para o logotipo QWEN interno quebraria silenciosamente a implantação white-label em terminais estreitos. O painel de informações continua sendo renderizado.
   - Caso contrário (o usuário não forneceu arte personalizada alguma), recai para `shortAsciiLogo`, cujo gate de largura do logotipo padrão decide se será exibido.
5. **Fallback**. Se ambos os tiers estiverem vazios ou inválidos devido a falhas suaves (arquivo ausente, limpo para vazio, configuração malformada), renderiza `shortAsciiLogo` como se não houvesse personalização, e trata com o gate de largura do logotipo padrão. O CLI **nunca** deve falhar devido a erros de configuração do banner.

Pseudocódigo para seleção de tier:

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
  return undefined; // Ocultar coluna do logotipo
}
```

## Adições ao Schema de Configurações

No objeto `ui` em `packages/cli/src/config/settingsSchema.ts`, imediatamente após `shellOutputMaxLines`, adicione quatro propriedades:

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
  // A forma de união que o tipo `type` do SettingDefinition não consegue expressar em tempo de execução.
  // A sobrescrita é emitida como está pelo gerador de schema JSON, permitindo que o VS Code aceite todas
  // as formas documentadas (string, {path}, {small,large}), sem marcar strings simples como erro.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` segue o padrão existente de `hideTips` (`showInDialog: true`);
os outros três campos de texto livre (título, subtítulo, arte) não entram na caixa de diálogo de configurações do aplicativo — fazer um editor ASCII multilinha em uma caixa de diálogo TUI é outro projeto; usuários avançados editam `settings.json` diretamente.

## Pontos de Alteração no Código

As alterações de implementação são pequenas. Abaixo estão os arquivos e as faixas de linhas no branch `main` atual.

`packages/cli/src/ui/components/AppHeader.tsx:53` — Expandir `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — Passar dados do banner analisado para `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx` — Expandir `HeaderProps`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` — Antes de calcular `logoWidth`, selecionar o tier e usar o padrão existente como fallback:

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

`packages/cli/src/ui/components/Header.tsx` — Título renderizado a partir da prop; subtítulo substitui a linha de espaçador em branco quando a prop é verdadeira:

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

**Novo arquivo**: `packages/cli/src/ui/utils/customBanner.ts` — Parser. Interface pública:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

O parser é responsável pela normalização, leitura de arquivos, limpeza e cache descritos no "Pipeline de Análise" acima. É chamado uma vez na inicialização do CLI e novamente em eventos de recarga a quente das configurações. Os caminhos de arquivo de cada escopo vêm diretamente de `settings.system.path` / `settings.workspace.path` / `settings.user.path`, portanto cada `{ path }` é resolvido em relação ao arquivo que o declara; quando `settings.isTrusted` é falso, o escopo do workspace é completamente ignorado.

## Comparação de Alternativas

Abaixo estão as 5 formas que foram avaliadas, para que mantenedores futuros entendam o espaço de design e possam reavaliar se necessário.

### Opção 1 — Três Campos Planos (Recomendado, Idêntico ao Issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Efeito**: Interface mínima para o usuário, correspondendo um a um com a descrição do issue.
- **Vantagens**: Curva de aprendizado zero; documentação muito fácil; consistente com os campos planos existentes de `ui.*` (`hideTips`, `customWittyPhrases`, etc.).
- **Desvantagens**: Três chaves semanticamente relacionadas espalhadas no nível superior de `ui`; se futuramente houver novos switches específicos de banner (gradiente, subtítulo, etc.), eles continuariam sendo adicionados como campos irmãos em `ui`, sem agrupamento natural.

### Opção 2 — Namespace Aninhado `ui.banner`

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

- **Efeito**: Capacidades equivalentes à Opção 1, agrupadas por funcionalidade.
- **Vantagens**: Switches específicos de banner futuros têm um namespace limpo; descoberta melhor em `/settings`.
- **Desvantagens**: Não corresponde exatamente à redação do issue; as configurações de interface do existente são predominantemente planas (apenas `ui.accessibility` e `ui.statusLine` são aninhados), o que prejudica a consistência; adiciona uma camada extra que o usuário precisa lembrar.
### Schema 3 – Preset de perfil do Banner com substituição de slot

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* substituições de slot do 'branded' */ }
  }
}
```

- **Efeito**: o usuário escolhe entre presets nomeados; usuários avançados substituem slots específicos no preset selecionado.
- **Vantagens**: melhor experiência de onboarding; presets podem vir com a CLI.
- **Desvantagens**: complexidade aumenta significativamente; presets são um compromisso de manutenção de longo prazo; a issue pede customização aberta, não curadoria de conteúdo.

### Schema 4 – Template de string do Banner inteiro

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Efeito**: um único template livre, com interpolação nos campos bloqueados.
- **Vantagens**: máxima flexibilidade para layouts não padronizados.
- **Desvantagens**: transfere a responsabilidade do layout para o usuário; perde a robustez do layout de duas colunas do Ink com largura do terminal; facilita a criação de templates que quebram em terminais estreitos; abre uma grande superfície de ataque para um benefício pequeno.

### Schema 5 – API de plugin/hook

Expor um hook de renderização de banner através do sistema de extensões.

- **Efeito**: customização em nível de código; extensões podem renderizar conteúdo arbitrário.
- **Vantagens**: maior capacidade máxima; empresas podem empacotar plugins de marca completos.
- **Desvantagens**: superfície da API enorme; renderização arbitrária no terminal requer revisão de segurança; é um *overdesign* completo para essa issue.

### Conclusão recomendada

**Adotar o schema 1.** Ele atende diretamente à issue, se encaixa no estilo existente de `ui.*` e não trava o namespace antes de sabermos quais outras opções exclusivas do banner podem surgir. Se, no futuro, campos irmãos começarem a se acumular, a migração para o schema 2 é aditiva – `ui.banner.title` e `ui.customBannerTitle` podem coexistir durante uma janela de depreciação.

## Segurança e tratamento de falhas

O conteúdo personalizado do banner é renderizado **textualmente no terminal** e, no modo `path`, também é **lido do disco**. Ambos os caminhos são acessíveis quando configurações maliciosas ou adulteradas são carregadas. O mesmo modelo de ameaça que a funcionalidade de título de sessão aborda se aplica aqui.

| Preocupação                                                     | Medida de proteção                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Injeção de ANSI / OSC-8 / CSI em ASCII art / título / subtítulo | *Stripper* específico para banner (`sanitizeArt`/`sanitizeSingleLine`): remove sequências de escape OSC/CSI/SS2/SS3, substitui os demais bytes de controle C0/C1 (incluindo DEL) por espaços. Aplica-se antes da renderização e da escrita no cache.                        |
| Arquivo grande congela a inicialização                          | Limite máximo de leitura de arquivo: 64 KB.                                                                                                                                                                                                                              |
| ASCII art patológico congela o layout                           | Limite de 200 linhas × 200 colunas por resultado analisado; excedido, trunca e emite aviso `[BANNER]`.                                                                                                                                                                   |
| Ataque de link simbólico no modo `path`                         | Leitura de arquivo usando `O_NOFOLLOW` (no Windows, degrada para somente leitura; constante não exposta).                                                                                                                                                                |
| Arquivo ausente ou ilegível                                     | Captura → aviso `[BANNER]` → fallback para o padrão; nunca lança exceção na interface do usuário.                                                                                                                                                                        |
| Título/subtítulo contém quebras de linha ou é muito longo       | Quebras de linha convertidas em espaços, truncado em 80 (título) / 160 (subtítulo) caracteres.                                                                                                                                                                           |
| Área de trabalho não confiável afeta renderização ou leitura    | Quando `settings.isTrusted` é falso, o analisador ignora completamente `settings.workspace` (consistente com a porta de confiança da visão `settings.merged`).                                                                                                            |
| Condição de corrida no recarregamento de configurações          | Resultado da análise é memoizado por chamada de acordo com a origem (caminho ou string); recarregamento executa novamente o analisador e relê os arquivos afetados.                                                                                                      |

Resumo dos modos de falha: todas as falhas leves eventualmente caem para `shortAsciiLogo` (ou título padrão bloqueado) + uma linha de log de depuração com aviso. Nenhum ramo pode produzir uma falha grave (lançar exceção para cima).

## Fora do escopo deste design

Os itens a seguir foram explicitamente excluídos. Cada um pode ser proposto separadamente no futuro, com base no feedback dos usuários.

| Item                                                                                          | Motivo da exclusão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conversão de texto em ASCII art (forma `{ text: "xxxCode" }`)                                  | **Rejeitado** na avaliação v1. Ou se introduz a dependência de tempo de execução do `figlet` (~2–3 MB descompactado com um conjunto de fontes utilizáveis), ou se faz *vendor* de um renderizador de fonte única (~200 linhas de código + um arquivo `.flf` de fonte mantido por nós). Ambos os caminhos trazem uma longa superfície de manutenção: escolha de fontes, auditoria de licenças de fontes, issues do tipo "minha fonte não renderiza no terminal X", tratamento de caracteres CJK/largura total. O caso de uso que impulsiona essa funcionalidade (marca branca/multi-inquilino) quase sempre terá um designer entregando ASCII art pronta, não dependendo da fonte padrão do figlet. Um usuário que deseja gerar com um comando hoje pode fazer `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` – efeito equivalente, zero dependências novas, zero custo de suporte interno no Qwen Code. Se a demanda aumentar no futuro, essa forma é puramente aditiva: estender `AsciiArtSource` para `string \| {path} \| {text, font?}` sem quebrar configurações existentes. |
| Comando `/banner` para edição online                                                          | A interface de configurações é o ponto de edição normativo; um editor online de ASCII multiline é outro projeto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Cores degradê / cor de linha única personalizadas                                            | A cor pertence ao tema. Se precisar de extensão, deve ser proposta em separado; a customização do banner não reinventa essa roda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Carregar ASCII art de URL                                                                     | Requisições de rede na inicialização trazem uma série de problemas: modos de falha, cache, revisão de segurança. O carregamento via `{path}` é um equivalente de baixo risco.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Animações (logo giratório, título em *marquee*)                                               | Aumenta a carga de renderização e problemas de acessibilidade; o caso de uso dessa funcionalidade não precisa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Alinhamento com banner do VSCode / Web UI                                                     | Essas duas interfaces atualmente não renderizam o banner do Ink. Se forem introduzidas no futuro, este design serve como referência.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Recarregamento dinâmico em alteração de arquivo                                               | O analisador só é executado na inicialização e no recarregamento de configurações. A necessidade de trocar a arte durante a sessão é rara; "reiniciar para aplicar" é um compromisso aceitável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Ocultar áreas bloqueadas individualmente (version / auth / model / path)                      | Elas são sinais de tempo de execução; ocultá-las prejudica o suporte e a postura de segurança muito mais do que o benefício em cenários de marca branca.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Plano de verificação

O PR de implementação subsequente deve passar pelas seguintes verificações ponta a ponta:

1. Configurar `~/.qwen/settings.json` com `customBannerTitle: "Acme CLI"` e um `customAsciiArt` inline → ao iniciar `qwen`, exibir o novo título e a nova arte ASCII; o sufixo da versão ainda aparece.
2. Configurar `customBannerSubtitle: "Built-in Acme Skills"` → a linha do subtítulo aparece com cor de texto secundária entre a linha do título e a linha de autenticação/modelo; autenticação, modelo e caminho ainda visíveis. Ao remover a configuração, volta para a linha *spacer* vazia (compatível com versões anteriores).
3. Configurar `hideBanner: true` → `qwen` inicia sem banner; dicas e conteúdo principal renderizados normalmente.
4. Configurar no `settings.json` do workspace `customAsciiArt: { "path": "./brand.txt" }`, com `brand.txt` no diretório `.qwen/` → ao abrir o workspace, carregar do disco.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensionar o terminal em três larguras (larga, média, estreita); exibir large na larga, small na média, ocultar a coluna do logo na estreita; painel de informações sempre visível.
6. Injetar `\x1b[31mhostile` em `customBannerTitle` **e** `customBannerSubtitle` → ambos renderizados como texto literal, sem serem interpretados como vermelho.
7. `path` apontar para arquivo inexistente → CLI inicia normalmente; `~/.qwen/debug/<sessionId>.txt` contém aviso `[BANNER]`; renderizar arte padrão.
8. Abrir uma *worktree* com a confiança do workspace desabilitada → `customAsciiArt` fornecido pelo workspace (incluindo itens `{ path }`) é silenciosamente ignorado; as configurações do escopo do usuário ainda são aplicadas.
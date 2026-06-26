# Personalizar o Design da Área do Banner

> Permita que usuários substituam a arte ASCII QWEN, troquem o título da marca e
> ocultem totalmente o banner — sem permitir que suprimam os dados operacionais
> (versão, autenticação, modelo, diretório de trabalho) que tornam o Qwen Code
> depurável e confiável.

## Visão Geral

O CLI do Qwen Code exibe um banner na inicialização contendo um logotipo ASCII QWEN
e um painel de informações com borda. Vários casos de uso reais desejam algum controle
sobre essa superfície:

- **Integração de marca própria / terceiros**: empresas e equipes que incorporam
  o Qwen Code em seus próprios produtos desejam exibir sua identidade visual em vez
  do padrão "Qwen Code".
- **Personalização**: indivíduos desejam adequar o banner do terminal a um padrão
  da equipe ou a seu próprio gosto.
- **Distinção multi-tenant / multi-instância**: em ambientes compartilhados,
  diferentes equipes desejam um sinal visual rápido para identificar em qual instância
  estão.

A postura do design é simples: **a marca (chrome) é substituível; os dados
operacionais não**. A personalização deve permitir que os usuários coloquem sua
própria marca no topo, e não que silenciem as informações que tornam uma sessão
depurável. Essa postura orienta cada decisão de "o que pode mudar vs. o que é fixo"
no restante deste documento.

Isso é rastreado pela [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomia das regiões do banner

Atualmente, o banner é renderizado por `Header` (montado a partir de `AppHeader`) e
divide-se nas seguintes regiões:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo Column ─────┐  gap=2  ┌──── Info Panel (bordered) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Title:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtitle: «blank, or override»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Path:     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips component renders below (governed by ui.hideTips) │
```

As duas caixas de nível superior são:

- **A. Coluna do logotipo** — um único bloco de arte ASCII com gradiente. Origem
  atualmente em `shortAsciiLogo` em
  `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Painel de informações** — uma caixa com borda contendo quatro linhas. A
  segunda linha é um espaçador visual vazio por padrão, opcionalmente substituído
  por uma legenda fornecida pelo chamador:
  - **B①** Título: `>_ Qwen Code (vX.Y.Z)` — texto da marca + sufixo de versão.
  - **B②** Legenda / espaçador: linha vazia de espaço único por padrão. Quando
    `ui.customBannerSubtitle` está definido, essa string ocupa esta linha (ex.:
    um fork pode usar `Built-in DataWorks Official Skills`).
  - **B③** Status: `<tipo de exibição de autenticação> | <modelo> ( /modelo para alterar)`.
  - **B④** Caminho: um diretório de trabalho encurtado com til.

Tudo é envolvido por `<AppHeader>`, que já controla a exibição do banner com
`showBanner = !config.getScreenReader()` (modo leitor de tela recai para saída simples).

## Regras de personalização — o que pode mudar, o que está bloqueado

| Região                                             | Fonte atual                               | Categoria de personalização         | Justificativa                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Coluna do logotipo**                            | `shortAsciiLogo` (`AsciiArt.ts`)          | **Substituível + ocultável autom.**  | Superfície pura de marca. Necessidade de white-label de controle total sobre o visual. A recaída existente de "ocultar automaticamente em terminais estreitos" é preservada.                                                                                                |
| **B①. Título — texto da marca** (`>_ Qwen Code`)    | Hard-coded em `Header.tsx`                | **Substituível**                     | Superfície de marca. O glifo `>_` inicial faz parte da marca existente; se um usuário quiser removê-lo, basta omiti-lo de `customBannerTitle`.                                                                                                                              |
| **B①. Título — sufixo de versão** (`(vX.Y.Z)`)      | Propriedade `version`                     | **Bloqueado**                        | Crítico para relatórios de bugs. Ocultá-lo torna a resposta "qual versão você está usando?" respondível apenas via `--version`, o que é um custo real em fluxos de suporte. Trocamos uma pequena perda de white-label pela rastreabilidade do suporte.                         |
| **B②. Linha de legenda / espaçador**                | Vazio por padrão                          | **Substituível**                     | Superfície pura de marca/contexto. Usada por forks white-label para rotular a build (ex.: "Built-in DataWorks Official Skills"). Sanitizada como o título; apenas uma linha — sem quebras de linha que quebrem o layout.                                                    |
| **B③. Linha de status** (autenticação + modelo)     | Propriedades `formattedAuthType`, `model` | **Bloqueado**                        | Sinal operacional e de segurança. Os usuários devem sempre ver qual credencial está em uso e qual modelo gastará seus tokens. Suprimir isso é um tiro no pé mesmo em cenários white-label.                                                                                   |
| **B④. Linha de caminho** (diretório de trabalho)    | Propriedade `workingDirectory`            | **Bloqueado**                        | Operacional. "Em qual diretório estou?" é uma pergunta constante; o banner é a resposta canônica.                                                                                                                                                                         |
| **Banner inteiro** (A + B)                           | Montagem de `<Header>` em `AppHeader.tsx` | **Ocultável**                        | Uma única configuração `ui.hideBanner: true` pula ambas as regiões — mesma forma que a proteção existente para leitor de tela. `<Tips>` continua sendo governado de forma independente por `ui.hideTips`.                                                                    |
A matriz se traduz em quatro configurações, sem mais:

| Configuração               | Padrão   | Efeito                                                                                                                                | Região afetada |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `ui.hideBanner`            | `false`  | Oculta todo o banner (regiões A + B).                                                                                                | A + B          |
| `ui.customBannerTitle`     | não definido | Substitui o texto da marca em B①. O sufixo de versão ainda é anexado. Cortado; uma string vazia significa "usar o padrão".            | B① texto da marca |
| `ui.customBannerSubtitle`  | não definido | Substitui a linha de espaçamento vazia B② por uma legenda de uma linha. Sanitizada; limitada a 160 caracteres; vazia significa "manter o espaçamento vazio". | B② espaçamento |
| `ui.customAsciiArt`        | não definido | Substitui a região A. Três formas aceitas (veja abaixo). Retorna ao padrão em caso de erro.                                           | A              |

O que **não** é oferecido, por design:

- Nenhuma configuração oculta apenas o sufixo de versão.
- Nenhuma configuração oculta apenas a linha de autenticação/modelo.
- Nenhuma configuração oculta apenas a linha do caminho.
- Nenhuma configuração altera as cores de gradiente do logotipo (o tema controla isso).
- Nenhuma configuração reordena ou reestrutura o painel de informações.

Se a implementação precisar expor algum desses itens no futuro, eles devem ser
novos campos com sua própria justificativa — não derivados dos três
campos acima.

## Guia de configuração do usuário — como modificar

### Limites de uma só vez

Um punhado de limites se aplica a toda personalização do banner. Tenha-os em mente
antes de criar arte manualmente para que o resolvedor não trunque ou rejeite
sua entrada.

| O quê                                    | Limite                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contagem de caracteres do título**     | **80 caracteres máx** (pós-sanitização). Qualquer coisa maior é truncada e um aviso `[BANNER]` é registrado. Caracteres de nova linha e controle são removidos antes da contagem.                |
| **Contagem de caracteres da legenda**    | **160 caracteres máx** (pós-sanitização). Mesmo pipeline de limpeza do título; mesmo aviso `[BANNER]` em caso de truncamento.                                                                   |
| **Tamanho do bloco de arte ASCII**       | **200 linhas × 200 colunas máx** por nível. Qualquer coisa maior é truncada para caber e um aviso `[BANNER]` é registrado.                                                                      |
| **Tamanho do arquivo de arte ASCII no disco** | **64 KB máx**. Arquivos maiores são lidos até o limite; o restante é ignorado.                                                                                                                  |
| **Largura da arte ASCII que é renderizada** | Determinada pelas colunas do terminal na inicialização, **não** uma contagem fixa de caracteres. Veja "Qual a largura máxima do logotipo?" abaixo para a fórmula e números por terminal.       |

Não há **limite fixo de contagem de caracteres para a arte ASCII** — apenas os
limites de coluna/linha acima e o orçamento de largura por inicialização. Um
nome de marca de 17 caracteres que renderizaria confortavelmente em uma fonte pode precisar de empilhamento ou
uma fonte mais densa em outra; o fator limitante é a largura visual, não as letras.

### Onde as configurações residem

Todas as quatro configurações ficam sob `ui` no `settings.json`. Tanto o nível de usuário
(`~/.qwen/settings.json`) quanto o nível de workspace (`.qwen/settings.json` no
diretório raiz do projeto) são suportados com a precedência de mesclagem padrão
(workspace sobrescreve usuário, sistema sobrescreve workspace).

`customAsciiArt` é tratado de forma especial: em vez de tratar o objeto inteiro
como um único valor que o escopo de maior precedência substitui, o resolvedor
percorre os escopos por nível. Se as configurações do usuário definirem `{ small }` e as configurações do workspace definirem `{ large }`, ambos contribuem — `small` do usuário,
`large` do workspace. Isso mantém duas coisas funcionando ao mesmo tempo:

1. Cada entrada `{ path }` é resolvida em relação ao arquivo que a declarou
   (`.qwen/` do workspace vs. `~/.qwen/` do usuário); apenas a visão mesclada
   perderia essa informação de escopo.
2. Os usuários podem manter um nível `large` padrão em suas configurações pessoais e
   substituir apenas `small` por workspace, sem reescrever o objeto
   inteiro.

Quando o mesmo nível é definido em vários escopos, a precedência normal se aplica
(sistema > workspace > usuário). Definir `customAsciiArt` como uma string simples
ou `{ path }` em qualquer escopo ainda preenche ambos os níveis nesse escopo.

### Ocultar o banner completamente

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

A saída de inicialização pula tanto a coluna do logotipo quanto o painel de informações.
As dicas ainda são renderizadas, a menos que `ui.hideTips` também seja `true`.
### Substituir o título da marca

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Renderiza como `Acme CLI (vX.Y.Z)` no painel de informações. O glifo `>_` é
removido quando um título personalizado é definido; se quiser mantê-lo, inclua-o
você mesmo: `"customBannerTitle": ">_ Acme CLI"`.

### Adicionar um subtítulo da marca

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Skills Oficiais Built-in do DataWorks",
  },
}
```

Renderiza o subtítulo em sua própria linha, na cor de texto secundária, no
lugar do espaçador em branco que normalmente fica entre o título e a linha de
autenticação/modelo:

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① título
│ Skills Oficiais Built-in do DataWorks                   │  ← B② subtítulo
│ Qwen OAuth | qwen-coder ( /model para alterar)          │  ← B③ status
│ ~/projects/example                                      │  ← B④ caminho
└─────────────────────────────────────────────────────────┘
```

Restrições:

- Apenas uma única linha. Novas linhas e outros bytes de controle são removidos /
  convertidos em espaços para que um acidente de colagem não quebre o layout do
  painel de informações.
- Sanitização limitada a 160 caracteres (mais flexível que o limite do título porque
  slogans / linhas "powered by" geralmente são um pouco mais longas).
- Deixe o campo não definido (ou defina-o como uma string vazia / espaços em branco)
  para manter a linha de espaçador em branco existente — a retrocompatibilidade é o padrão.
- O subtítulo não altera quais linhas estão bloqueadas; autenticação, modelo
  e diretório de trabalho estão sempre visíveis independentemente do estado do subtítulo.

### Substituir a arte ASCII — string inline

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Use `\n` para incorporar novas linhas dentro da string JSON. A arte é renderizada
com o tema gradiente ativo, assim como o logotipo padrão.

> **Não tem arte ASCII à mão?** Use qualquer gerador externo e cole
> o resultado. O caminho mais simples é o `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` e então aponte
> `customAsciiArt: { "path": "./brand.txt" }` para ele. A CLI não
> renderiza texto para arte em tempo de execução — veja a seção _Fora do escopo_
> para entender o motivo.

### Substituir a arte ASCII — arquivo externo

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Evita o escape JSON de uma string multilinha. Regras de resolução de caminho:

- **Configurações do workspace**: caminhos relativos são resolvidos em relação ao diretório
  `.qwen/` do workspace.
- **Configurações do usuário**: caminhos relativos são resolvidos em relação a `~/.qwen/`.
- Caminhos absolutos são usados como estão.
- O arquivo é lido **uma vez na inicialização**, sanitizado e armazenado em cache.
  Editar o arquivo durante a sessão não re-renderiza o banner — reinicie a CLI.

### Substituir a arte ASCII — sensível à largura

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

`large` é preferido quando o terminal é largo o suficiente; caso contrário, `small`
é usado; caso contrário, a coluna do logotipo é ocultada (o fallback existente de duas colunas).
Cada nível pode ser uma string ou `{ path }`. Cada nível pode ser
omitido: um nível ausente simplesmente cai para o próximo passo.

### Qual a largura máxima do logotipo? — o orçamento de tamanho

Não há limite rígido de contagem de caracteres para o título ou arte. Há um
**orçamento de largura** determinado pelas colunas do terminal e um limite absoluto
rígido para evitar que um arquivo malformado congele o layout:

| Parâmetro                                          | Limite                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Colunas do terminal na inicialização               | O que o terminal do usuário reportar.                                  |
| Margem externa do contêiner                        | 4 cols (2 esquerda + 2 direita).                                       |
| Espaço entre logotipo e painel de informações      | 2 cols.                                                                |
| Largura mínima do painel de informações            | 44 cols (40 caminho + borda + padding).                                |
| **Largura disponível do logotipo** (por nível, no momento da renderização) | `colunasTerminal − 4 − 2 − 44 = colunasTerminal − 50`.  |
| Limite rígido para cada nível de arte (pós-sanitização) | 200 cols × 200 linhas. Qualquer coisa além é truncada + aviso `[BANNER]`. |
| Limite rígido para `customBannerTitle` (pós-sanitização) | 80 caracteres. Qualquer coisa além é truncada + aviso `[BANNER]`.     |

Lendo o orçamento em larguras comuns de terminal:

| Colunas do terminal | Largura máxima do logotipo que renderiza | O que isso significa na prática                                           |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| 80                  | 30                                       | A maioria das letras "ANSI Shadow" do figlet têm ~7–11 cols — no máximo 3 letras. |
| 100                 | 50                                       | Uma palavra curta em ANSI Shadow (~6 letras), ou duas palavras curtas empilhadas. |
| 120                 | 70                                       | Arte de palavra multilinha empilhada cabe confortavelmente.               |
| 200                 | 150                                      | Strings inline longas como nomes completos de produto em ANSI Shadow cabem. |
Duas implicações práticas ao projetar sua arte:

1. **Uma marca com várias palavras geralmente não será renderizada como uma única linha de ANSI Shadow na maioria dos terminais.** Com ~7–9 colunas por letra ANSI Shadow, mesmo uma marca de 12 caracteres como `Custom Agent` tem aproximadamente 95 colunas de arte em uma única linha — já mais do que um terminal de 100 colunas pode disponibilizar junto ao painel de informações. Ou empilhe as palavras em várias linhas, escolha uma fonte figlet mais densa ou use uma decoração de texto compacta de uma linha como `▶ Custom Agent ◀`.
2. **Use o formato `{ small, large }` sensível à largura** quando um único nível forçar você a escolher entre "fica ótimo em tela larga / morre em tela estreita" e "fica bom em tela estreita / desperdiça espaço em tela larga". O exemplo abaixo empilha as palavras para um terminal de ≥104 colunas em `large` e recai para uma decoração de 16 colunas em uma linha em `small`.

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

Onde `banner-large.txt` contém a saída ANSI Shadow das palavras empilhadas (~54 colunas × 12 linhas), por exemplo, gerada por:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinar todos os três

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

### Como verificar sua alteração

1. Salve o `settings.json` e inicie uma nova sessão `qwen` — a resolução do banner é executada uma vez na inicialização.
2. Redimensione o terminal para confirmar que os níveis `small` / `large` alternam conforme esperado, e que a coluna do logotipo desaparece em larguras muito estreitas.
3. Se algo não aparecer como esperado, veja `~/.qwen/debug/<sessionId>.txt` (o link simbólico `latest.txt` aponta para a sessão atual) e procure por `[BANNER]` — cada falha suave registra uma linha de aviso com o motivo subjacente.

## Pipeline de resolução

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
   │ 1. normalize to         │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. resolve each tier:   │           │
   │    string → as-is       │           │  pick tier by
   │    {path} → fs.read     │           │    availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         render Logo Column
   │ 3. sanitize art:        │         render Info Panel:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lines × 200    │                   ?? '>_ Qwen Code'
   │    cols                 │           Subtitle = customBannerSubtitle
   │ 4. sanitize title +     │                   ?? blank spacer row
   │    subtitle (single-    │           Status   = locked
   │    line, ≤ 80 / 160     │           Path     = locked
   │    chars)               │
   │ 5. memoize by source    │
   └─────────────────────────┘
```

O algoritmo de resolução de cinco etapas é executado uma vez quando as configurações são carregadas e novamente apenas em eventos de recarregamento de configurações:

1. **Normalizar**. Uma `string` simples ou `{ path }` se torna `{ small: x, large: x }`. Um objeto `{ small, large }` passa adiante.
2. **Resolver cada nível**. Para cada `AsciiArtSource`:
   - Se for uma string, use-a como está.
   - Se for `{ path }`, leia o arquivo de forma síncrona com defesa `O_NOFOLLOW` (Windows: somente leitura simples — a constante não está exposta), limitado a 64 KB. Caminhos relativos são resolvidos em relação ao _diretório do arquivo de configurações proprietário_ — configurações do workspace em relação ao `.qwen/` do workspace, configurações do usuário em relação a `~/.qwen/`. Falha de leitura registra aviso `[BANNER]` e volta ao padrão para aquele nível.
3. **Sanitizar**. Um removedor específico de banner descarta lideranças OSC / CSI / SS2 / SS3 e substitui qualquer outro byte de controle C0 / C1 (e DEL) por um espaço, preservando `\n` para que a arte multilinha sobreviva. Remova espaços em branco no final de cada linha e limite a 200 linhas × 200 colunas. Qualquer coisa além do limite é truncada e um aviso `[BANNER]` é registrado.
4. **Seleção de nível em tempo de renderização**. No `Header.tsx`, dados os `small` e `large` resolvidos, avalie o orçamento de largura existente (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Prefira `large` se couber.
   - Caso contrário, recorra a `small` se couber.
   - Caso contrário, **se o usuário forneceu alguma arte personalizada**, oculte completamente a coluna do logotipo (a ramificação existente `showLogo = false`) — recorrer ao logotipo QWEN embutido aqui desfaria silenciosamente uma implantação de marca branca em terminais estreitos. O painel de informações ainda é renderizado.
   - Caso contrário (nenhuma arte personalizada foi fornecida) caia para `shortAsciiLogo` e deixe o portão de largura existente decidir se deve mostrar ou ocultar o logotipo padrão.
5. **Fallback**. Se ambos os níveis ficarem vazios ou inválidos devido a falhas suaves (arquivo ausente, sanitização rejeitou tudo, configuração malformada), comporte-se como se nenhuma personalização tivesse sido definida: renderize `shortAsciiLogo` e siga o portão de largura do logotipo padrão. O CLI nunca deve travar em um erro de configuração de banner.
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
  return undefined; // coluna de logo oculta
}
```

## Adições ao esquema de configurações

Quatro novas propriedades são anexadas ao objeto `ui` em
`packages/cli/src/config/settingsSchema.ts`, imediatamente após
`shellOutputMaxLines`:

```ts
hideBanner: {
  type: 'boolean',
  label: 'Ocultar Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Oculta o banner ASCII de inicialização e o painel de informações.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Título Personalizado do Banner',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Substitui o título padrão ">_ Qwen Code" exibido no painel de informações do banner. O sufixo de versão é sempre anexado.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Subtítulo Personalizado do Banner',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Linha de subtítulo opcional renderizada entre o título do banner e a linha de autenticação/modelo. Quando não definido, o painel de informações mantém sua linha de espaçamento em branco.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Arte ASCII Personalizada',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Substitui a arte ASCII QWEN padrão. Aceita uma string inline, {"path": "..."}, ou {"small": ..., "large": ...} para seleção com base na largura.',
  showInDialog: false,
  // O runtime aceita uma união que o campo `type` do SettingDefinition não consegue
  // expressar. A sobrescrita é emitida literalmente pelo gerador de esquema JSON
  // para que o VS Code aceite todas as formas documentadas (string, {path}, ou
  // {small,large}) sem sinalizar a forma de string simples.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` espelha o padrão existente `hideTips` (`showInDialog:
true`). Os três campos de formato livre (título, subtítulo, arte) ficam de fora
da caixa de diálogo de configurações do aplicativo porque um editor ASCII multilinha na
caixa de diálogo TUI é um projeto próprio; usuários avançados editam `settings.json`
diretamente.

## Alterações na implementação

Os pontos de contato da implementação são pequenos. Cada um é descrito abaixo com
o arquivo e a faixa de linha do `main` atual.

`packages/cli/src/ui/components/AppHeader.tsx:53` — estender `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — passar o banner
resolvido para `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx` — estender `HeaderProps`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` — selecionar o nível antes
de calcular `logoWidth`, com o padrão existente como base:

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

`packages/cli/src/ui/components/Header.tsx` — renderizar o título a partir da
propriedade, e usar a propriedade de subtítulo no lugar da linha de espaçamento em branco
quando definida:

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

**Novo arquivo**: `packages/cli/src/ui/utils/customBanner.ts` — o resolvedor.
Exporta:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

O resolvedor realiza a normalização, leitura de arquivos, sanitização e
armazenamento em cache descritos no pipeline de resolução acima. Ele é chamado uma vez
durante a inicialização da CLI e executado novamente em eventos de recarga a quente das configurações. Caminhos de arquivo por escopo vêm de `settings.system.path` / `settings.workspace.path`
/ `settings.user.path` diretamente, então cada `{ path }` resolve
contra o arquivo que o declarou; configurações de workspace são ignoradas completamente
quando `settings.isTrusted` é falso.

## Abordagens alternativas consideradas
Cinco formas deste recurso foram consideradas. Elas estão listadas aqui para que contribuidores futuros entendam o espaço de design e possam revisitar a escolha se as restrições mudarem.

### Opção 1 — Três configurações simples (RECOMENDADA, corresponde à issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Efeito**: superfície mínima voltada ao usuário; exatamente o que a issue pede.
- **Prós**: nenhuma curva de aprendizado; documentação trivial; consistente com as propriedades planas existentes de `ui.*` (`hideTips`, `customWittyPhrases`, etc.).
- **Contras**: três chaves de alto nível que conceitualmente pertencem juntas não estão agrupadas; futuros ajustes exclusivos do banner (gradiente, subtítulo) adicionariam mais irmãos a `ui` em vez de aninhar de forma limpa.

### Opção 2 — Namespace aninhado `ui.banner`

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

- **Efeito**: mesmas capacidades da Opção 1, organizadas por recurso.
- **Prós**: namespace limpo para futuros ajustes exclusivos do banner; descoberta mais fácil via `/settings`.
- **Contras**: diverge do texto exato da issue; as configurações de UI existentes são em sua maioria planas (apenas `ui.accessibility` e `ui.statusLine` aninham), então a consistência é mista; adiciona um nível de aninhamento para o usuário lembrar.

### Opção 3 — Presets de perfil de banner + substituições de slot

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **Efeito**: usuários escolhem entre presets nomeados; usuários avançados substituem slots dentro de um perfil escolhido.
- **Prós**: boa experiência de onboarding; presets acompanham a CLI.
- **Contras**: complexidade significativa; presets são um compromisso de manutenção; a issue pede customização bruta, não curadoria.

### Opção 4 — Substituição completa do banner (template de string única)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Efeito**: template livre único com variáveis fixas preenchidas.
- **Prós**: flexibilidade máxima para layouts não padrão.
- **Contras**: reimplementa layout no espaço do usuário; perde a resiliência de duas colunas do Ink à largura do terminal; muito fácil escrever um template que quebra em terminais estreitos; grande raio de alcance para um recurso pequeno.

### Opção 5 — API de plugin / hook

Expor um hook de renderização de banner através do sistema de extensões.

- **Efeito**: customização a nível de código; extensões podem renderizar qualquer coisa.
- **Prós**: poder máximo; permite que empresas enviem um plugin de marca lacrado.
- **Contras**: grande superfície de API; precisa de revisão de segurança para renderização arbitrária do terminal; enormemente desproporcional para a issue.

### Recomendação

**A Opção 1** é recomendada. Ela satisfaz a issue literalmente, encaixa-se no estilo existente de `ui.*` e evita forçar uma decisão de namespace aninhado antes de sabermos como seriam outros ajustes exclusivos do banner. Se futuros irmãos começarem a se acumular, migrar para a Opção 2 é aditivo — `ui.banner.title` e `ui.customBannerTitle` podem coexistir durante uma janela de depreciação.

## Segurança & tratamento de falhas

O conteúdo do banner customizado é renderizado literalmente no terminal E, no formato de caminho, lido do disco. Ambas as superfícies são acessíveis para ataques se um arquivo de configuração hostil ou comprometido for carregado. O mesmo modelo de ameaça que direciona o recurso de título da sessão se aplica aqui.

| Preocupação                                                                 | Proteção                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injeção de ANSI / OSC-8 / CSI na arte, título ou subtítulo                  | Stripper específico do banner (`sanitizeArt` / `sanitizeSingleLine`): remove líderes OSC / CSI / SS2 / SS3 e substitui qualquer outro byte de controle C0 / C1 (e DEL) por um espaço. Aplicado antes da renderização e da escrita do cache. |
| Arquivo grande congela a inicialização                                      | Limite rígido de 64 KB nas leituras de arquivo.                                                                                                                                                      |
| Arte patológica congela o layout                                            | Limite de 200 linhas × 200 colunas em cada string resolvida. Excedente é truncado; um aviso `[BANNER]` é registrado.                                                                                 |
| Redirecionamento de link simbólico no formato de caminho                    | `O_NOFOLLOW` nas leituras de arquivo (Windows: somente leitura simples; constante não exposta).                                                                                                       |
| Arquivo ausente ou ilegível                                                 | Capturar, registrar aviso `[BANNER]`, cair para o padrão. Nunca lançar exceção na UI.                                                                                                               |
| Título ou subtítulo com quebras de linha / comprimento excessivo            | Quebras de linha convertidas em espaços; limitado a 80 (título) / 160 (subtítulo) caracteres.                                                                                                        |
| Workspace não confiável influenciando renderização ou leituras de arquivo    | Quando `settings.isTrusted` é falso, o resolvedor ignora completamente `settings.workspace` (espelha a barreira de confiança que `settings.merged` aplica).                                            |
| Condição de corrida no recarregamento das configurações                      | A resolução é memoizada por fonte (hash do caminho ou da string) por chamada. Recarregamentos reexecutam o resolvedor e releem os arquivos afetados.                                                  |
Resumo dos modos de falha: toda falha suave termina em `shortAsciiLogo` (ou no título padrão bloqueado) mais um aviso no log de depuração. Falhas severas (erros lançados) não são permitidas em nenhum ramo do resolvedor.

## Fora do escopo

Estes foram considerados e deliberadamente adiados. Cada um pode ser um acompanhamento separado se surgir demanda do usuário.

| Item                                                               | Por que não                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderização de texto para ASCII (formato `{ text: "xxxCode" }`)   | Considerado e rejeitado para v1. Adicionar isso exigiria uma dependência de tempo de execução `figlet` (~2–3 MB descompactados após a inclusão de um conjunto utilizável de fontes) ou um renderizador de fonte única vendido (~200 linhas + um arquivo de fonte `.flf` próprio). Ambas as opções trazem uma área de superfície contínua: seleção de fonte, rastreamento de licença de fonte, problemas "minha fonte não renderiza corretamente no terminal X" e manipulação de CJK / caracteres largos. O caso de uso principal para este recurso (white-label / multi-tenant) quase sempre tem um designer produzindo arte ASCII intencional, não confiando em uma fonte figlet padrão. Usuários que desejam geração de uma linha já podem obtê-la com `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — mesmo resultado, sem dependência adicional, sem ônus de suporte dentro do Qwen Code. Se a demanda surgir posteriormente, esta forma é puramente aditiva: estender `AsciiArtSource` para `string \| {path} \| {text, font?}` sem quebrar nenhuma configuração existente. |
| Comando de barra `/banner` para edição ao vivo                     | A interface de configurações é a superfície de edição canônica. Um editor ao vivo para arte ASCII de várias linhas é um projeto próprio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Cores gradientes personalizadas / substituições de cor por linha   | O tema é dono das cores. Uma proposta separada pode estender o contrato do tema; a personalização do banner não deve duplicar essa superfície.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Arte ASCII carregada por URL                                       | Busca em rede na inicialização é uma caixa de pandora — modos de falha, cache, revisão de segurança. A forma de caminho de arquivo é o equivalente de menor risco.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Animação (logotipo giratório, título em marquee)                   | Adiciona carga de renderização e preocupações de acessibilidade; nada nos casos de uso necessita disso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Paridade de banner com VSCode / Web UI                             | Essas superfícies não renderizam o banner do Ink atualmente. Se elas ganharem um banner, este design é a referência.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Recarga dinâmica na alteração de arquivo                           | O resolvedor é executado apenas na inicialização e na recarga de configurações. Mudanças de arte no meio da sessão são raras o suficiente para que "reiniciar para fazer efeito" seja a troca aceitável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Ocultar apenas regiões bloqueadas individuais (versão, autenticação, modelo, caminho) | Estes são sinais operacionais; suprimi-los prejudica o suporte e a postura de segurança mais do que ajuda cenários white-label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
## Plano de verificação

Para o eventual PR de implementação, as seguintes verificações ponta a ponta devem ser aprovadas.

1. `~/.qwen/settings.json` com `customBannerTitle: "Acme CLI"` e uma string inline `customAsciiArt` → `qwen` mostra o novo título e arte; o sufixo da versão ainda presente.
2. `customBannerSubtitle: "Built-in Acme Skills"` → a linha do subtítulo é renderizada entre o título e a linha de autenticação/modelo na cor de texto secundária; autenticação, modelo e caminho ainda visíveis. Removê-lo restaura a linha de espaço em branco (back-compat).
3. `hideBanner: true` → `qwen` inicia sem banner; dicas e chat são renderizados normalmente.
4. `customAsciiArt: { "path": "./brand.txt" }` em um `settings.json` do workspace, com `brand.txt` ao lado dele em `.qwen/` → carrega do disco ao abrir o workspace.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensione o terminal entre largo, médio e estreito; grande em larguras largas, pequeno em larguras médias, coluna do logotipo oculta em larguras estreitas, painel de informações sempre visível.
6. Injete `\x1b[31mhostile` em `customBannerTitle` _e_ `customBannerSubtitle` → ambos são renderizados como texto literal, não interpretados como vermelho.
7. Aponte `path` para um arquivo ausente → CLI inicia; aviso `[BANNER]` aparece em `~/.qwen/debug/<sessionId>.txt`; arte padrão é renderizada.
8. Abra a árvore de trabalho com a confiança do workspace desativada → `customAsciiArt` definido no workspace (incluindo entradas `{ path }`) é ignorado silenciosamente; configurações de escopo do usuário ainda são aplicadas.
9. `npm test` e `npm run typecheck` passam para o pacote CLI; testes unitários em `customBanner.test.ts` cobrem cada formato aceito e cada caminho de falha (arquivo ausente, arquivo grande demais, injeção ANSI, objeto malformado).

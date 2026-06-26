# Personalizar o Design da Área do Banner

> Permita que os usuários substituam a arte ASCII QWEN, substituam o título da marca e ocultem o banner completamente — sem permitir que suprimam os dados operacionais (versão, autenticação, modelo, diretório de trabalho) que tornam o Qwen Code depurável e confiável.

## Visão Geral

O CLI do Qwen Code exibe um banner na inicialização contendo um logotipo ASCII QWEN e um painel de informações com borda. Vários casos de uso reais desejam algum controle sobre essa superfície:

- **Integração de marca white-label / terceiros**: empresas e equipes que incorporam o Qwen Code em seus próprios produtos desejam exibir sua identidade de marca em vez do "Qwen Code" padrão.
- **Personalização**: indivíduos desejam combinar o banner do terminal com um padrão da equipe ou seu próprio gosto.
- **Distinção multi-inquilino / multi-instância**: em ambientes compartilhados, diferentes equipes desejam um sinal visual rápido de em qual instância estão.

A posição de design é simples: **o chrome da marca é substituível; os dados operacionais não são**. A personalização deve permitir que os usuários coloquem sua própria marca no topo, não que silenciem as informações que tornam uma sessão depurável. Essa posição orienta todas as decisões de "o que pode mudar vs. o que está bloqueado" no restante deste documento.

Isso é rastreado pela [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomia da região do banner

Atualmente, o banner é renderizado por `Header` (montado a partir de `AppHeader`) e se divide nas seguintes regiões:

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

- **A. Coluna do logotipo** — um único bloco de arte ASCII com gradiente. Originado atualmente de `shortAsciiLogo` em `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Painel de informações** — uma caixa com borda contendo quatro linhas. A segunda linha é um espaçador visual em branco por padrão, opcionalmente substituído por um subtítulo fornecido pelo chamador:
  - **B①** Título: `>_ Qwen Code (vX.Y.Z)` — texto da marca + sufixo de versão.
  - **B②** Subtítulo / espaçador: linha em branco de espaço único por padrão. Quando `ui.customBannerSubtitle` está definido, essa string ocupa esta linha (por exemplo, um fork pode usar `Built-in DataWorks Official Skills`).
  - **B③** Status: `<tipo de exibição de autenticação> | <modelo> ( /model para alterar)`.
  - **B④** Caminho: um diretório de trabalho encurtado com til.

Tudo é envolvido por `<AppHeader>`, que já controla o banner com `showBanner = !config.getScreenReader()` (o modo leitor de tela recorre à saída simples).

## Regras de personalização — o que pode mudar, o que está bloqueado

| Região                                       | Fonte atual                          | Categoria de personalização     | Justificativa                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Coluna do logotipo**                    | `shortAsciiLogo` (`AsciiArt.ts`)     | **Substituível + ocultável automaticamente** | Superfície pura da marca. White-label precisa de controle total sobre o visual. O fallback existente de "ocultar automaticamente em terminais estreitos" é preservado.                                                  |
| **B①. Título — texto da marca** (`>_ Qwen Code`) | Codificado em `Header.tsx`           | **Substituível**                | Superfície da marca. O glifo `>_` faz parte da marca existente; se um usuário quiser removê-lo, basta omiti-lo de `customBannerTitle`.                                                                                |
| **B①. Título — sufixo de versão** (`(vX.Y.Z)`) | Prop `version`                      | **Bloqueado**                   | Crítico para relatórios de bugs. Ocultá-lo torna "qual versão você está?" respondível apenas via `--version`, o que é um custo real nos fluxos de trabalho de suporte. Trocamos uma pequena perda de white-label pela rastreabilidade do suporte. |
| **B②. Linha de subtítulo / espaçador**        | em branco por padrão                 | **Substituível**                | Superfície pura de marca / contexto. Usado por forks white-label para rotular a build (ex.: "Built-in DataWorks Official Skills"). Sanitizado como o título; apenas uma linha — sem quebras de linha que quebrem o layout.            |
| **B③. Linha de status** (autenticação + modelo) | Props `formattedAuthType`, `model` | **Bloqueado**                   | Sinal operacional e de segurança. Os usuários devem sempre ver qual credencial está em uso e qual modelo gastará seus tokens. Suprimi-lo é uma armadilha mesmo para cenários white-label.                                |
| **B④. Linha de caminho** (diretório de trabalho) | Prop `workingDirectory`             | **Bloqueado**                   | Operacional. "Em qual diretório estou?" é uma pergunta constante; o banner é sua resposta canônica.                                                                                                                   |
| **Banner inteiro** (A + B)                    | Montagem de `<Header>` em `AppHeader.tsx` | **Ocultável**              | Um único `ui.hideBanner: true` pula ambas as regiões — mesma forma que o gate existente do leitor de tela. `<Tips>` continua sendo governado independentemente por `ui.hideTips`.                                     |

A matriz se traduz em quatro configurações, no máximo:

| Configuração               | Padrão  | Efeito                                                                                                                               | Região afetada |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `ui.hideBanner`            | `false` | Oculta o banner inteiro (regiões A + B).                                                                                             | A + B           |
| `ui.customBannerTitle`     | não definido | Substitui o texto da marca em B①. O sufixo de versão ainda é anexado. Aparado; uma string vazia significa "usar o padrão".          | B① texto da marca |
| `ui.customBannerSubtitle`  | não definido | Substitui a linha de espaçador em branco B② por um subtítulo de uma linha. Sanitizado; limitado a 160 caracteres; vazio significa "manter o espaçador em branco". | B② espaçador |
| `ui.customAsciiArt`        | não definido | Substitui a região A. Três formatos aceitos (veja abaixo). Reverte para o padrão em qualquer erro.                                   | A              |

O que **não** é oferecido, por design:

- Nenhuma configuração oculta apenas o sufixo de versão.
- Nenhuma configuração oculta apenas a linha de autenticação/modelo.
- Nenhuma configuração oculta apenas a linha de caminho.
- Nenhuma configuração altera as cores do gradiente do logotipo (o tema é responsável por isso).
- Nenhuma configuração reordena ou reestrutura o painel de informações.

Se a implementação posteriormente precisar expor qualquer um desses itens, eles devem ser novos campos com sua própria justificativa — não derivados dos três campos acima.

## Guia de configuração do usuário — como modificar

### Limites de relance

Um punhado de limites se aplica a toda personalização de banner. Tenha-os em mente antes de criar arte manualmente para que o resolvedor não trunque ou rejeite sua entrada.

| O quê                             | Limite                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contagem de caracteres do título**        | **Máximo de 80 caracteres** (após sanitização). Qualquer coisa mais longa é truncada e um aviso `[BANNER]` é registrado. Quebras de linha e caracteres de controle são removidos antes de contar este comprimento. |
| **Contagem de caracteres do subtítulo**     | **Máximo de 160 caracteres** (após sanitização). Mesmo pipeline de limpeza do título; mesmo aviso `[BANNER]` em truncamento.                                                             |
| **Tamanho do bloco de arte ASCII**         | **Máximo de 200 linhas × 200 colunas** por nível. Qualquer coisa maior é truncada para caber e um aviso `[BANNER]` é registrado.                                                              |
| **Tamanho do arquivo de arte ASCII em disco**  | **Máximo de 64 KB**. Arquivos maiores são lidos até o limite; o restante é ignorado.                                                                                                    |
| **Largura da arte ASCII que renderiza** | Determinada pelas colunas do terminal na inicialização, **não** uma contagem fixa de caracteres. Veja "Qual largura o logotipo pode ter?" abaixo para a fórmula e números por terminal.                     |

Não há **limite fixo de contagem de caracteres na arte ASCII** — apenas os limites de coluna/linha acima e o orçamento de largura por inicialização. Um nome de marca de 17 caracteres que renderizaria confortavelmente em uma fonte pode precisar de empilhamento ou uma fonte mais densa em outra; o fator limitante é a largura visual, não as letras.

### Onde as configurações residem

Todas as quatro configurações ficam sob `ui` em `settings.json`. Tanto o nível de usuário (`~/.qwen/settings.json`) quanto o nível de workspace (`.qwen/settings.json` na raiz do projeto) são suportados com a precedência de mesclagem padrão (workspace sobrescreve usuário, sistema sobrescreve workspace).

`customAsciiArt` é um caso especial: em vez de tratar todo o objeto como um valor que o escopo de maior precedência substitui, o resolvedor percorre os escopos por nível. Se as configurações do usuário definirem `{ small }` e as configurações do workspace definirem `{ large }`, ambos contribuem — `small` do usuário, `large` do workspace. Isso mantém duas coisas funcionando ao mesmo tempo:

1. Cada entrada `{ path }` é resolvida em relação ao arquivo que a declarou (workspace `.qwen/` vs. usuário `~/.qwen/`); apenas a visão mesclada perderia essa informação de escopo.
2. Os usuários podem manter um nível `large` padrão em suas configurações pessoais e substituir apenas `small` por workspace, sem repetir todo o objeto.

Quando o mesmo nível é definido em vários escopos, a precedência normal se aplica (sistema > workspace > usuário). Definir `customAsciiArt` como uma string simples ou `{ path }` em qualquer escopo ainda preenche ambos os níveis nesse escopo.

### Ocultar o banner completamente

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

A saída de inicialização pula tanto a coluna do logotipo quanto o painel de informações. As dicas ainda renderizam a menos que `ui.hideTips` também seja `true`.

### Substituir o título da marca

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Renderiza como `Acme CLI (vX.Y.Z)` no painel de informações. O glifo `>_` é removido quando um título personalizado é definido; se você quiser de volta, inclua-o você mesmo: `"customBannerTitle": ">_ Acme CLI"`.

### Adicionar um subtítulo de marca

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Renderiza o subtítulo em sua própria linha, na cor de texto secundária, no lugar do espaçador em branco que normalmente fica entre o título e a linha de autenticação/modelo:

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① título
│ Built-in DataWorks Official Skills                      │  ← B② subtítulo
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ status
│ ~/projects/example                                      │  ← B④ caminho
└─────────────────────────────────────────────────────────┘
```

Restrições:

- Apenas uma linha. Quebras de linha e outros bytes de controle são removidos / transformados em espaços para que um acidente de colagem não quebre o layout do painel de informações.
- Sanitizado e limitado a 160 caracteres (mais flexível que o limite do título porque linhas de tagline / "powered by" geralmente são um pouco mais longas).
- Deixe o campo não definido (ou defina-o como uma string vazia / espaço em branco) para manter a linha de espaçador em branco existente — compatibilidade retroativa é o padrão.
- O subtítulo não altera quais linhas estão bloqueadas; autenticação, modelo e diretório de trabalho estão sempre visíveis independentemente do estado do subtítulo.

### Substituir a arte ASCII — string inline

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Use `\n` para incorporar quebras de linha dentro da string JSON. A arte é renderizada com o tema de gradiente ativo assim como o logotipo padrão.

> **Não tem arte ASCII à mão?** Use qualquer gerador externo e cole o resultado. O caminho mais simples é `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` e então aponte `customAsciiArt: { "path": "./brand.txt" }` para ele. O CLI não renderiza texto para arte em tempo de execução — veja a seção _Fora do escopo_ para saber o porquê.

### Substituir a arte ASCII — arquivo externo

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Evita escapar uma string multi-linha em JSON. Regras de resolução de caminho:

- **Configurações do workspace**: caminhos relativos são resolvidos em relação ao diretório `.qwen/` do workspace.
- **Configurações do usuário**: caminhos relativos são resolvidos em relação a `~/.qwen/`.
- Caminhos absolutos são usados como estão.
- O arquivo é lido **uma vez na inicialização**, sanitizado e armazenado em cache. Editar o arquivo no meio da sessão não re-renderiza o banner — reinicie o CLI.

### Substituir a arte ASCII — ciente de largura

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

`large` é preferido quando o terminal é largo o suficiente; caso contrário, `small` é usado; caso contrário, a coluna do logotipo é ocultada (o fallback existente de duas colunas). Qualquer nível pode ser uma string ou `{ path }`. Qualquer nível pode ser omitido: um nível ausente simplesmente passa para a próxima etapa.

### Qual largura o logotipo pode ter? — o orçamento de tamanho

Não há limite rígido de contagem de caracteres para o título ou arte. Há um **orçamento de largura** determinado pelas colunas do terminal e um limite rígido absoluto para evitar que um arquivo malformado congele o layout:

| Controle                                             | Limite                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Colunas do terminal na inicialização                 | O que o terminal do usuário relatar.                                  |
| Margem externa do container                          | 4 colunas (2 esquerda + 2 direita).                                   |
| Espaço entre logotipo e painel de informações        | 2 colunas.                                                            |
| Largura mínima do painel de informações               | 44 colunas (40 caminho + borda + preenchimento).                      |
| **Largura disponível do logotipo** (por nível, no momento da renderização) | `terminalCols − 4 − 2 − 44 = terminalCols − 50`.                      |
| Limite rígido em cada nível de arte (após sanitização) | 200 cols × 200 linhas. Qualquer coisa além é truncada + aviso `[BANNER]`. |
| Limite rígido em `customBannerTitle` (após sanitização) | 80 caracteres. Qualquer coisa além é truncada + aviso `[BANNER]`.     |

Lendo o orçamento em larguras de terminal comuns:

| Colunas do terminal | Largura máxima do logotipo que renderiza | O que isso significa na prática                                           |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| 80                  | 30                                       | A maioria das letras "ANSI Shadow" do figlet tem ~7–11 cols — no máximo 3 letras. |
| 100                 | 50                                       | Uma palavra curta em ANSI Shadow (~6 letras), ou duas palavras curtas empilhadas. |
| 120                 | 70                                       | Arte de palavras empilhadas em várias linhas cabe confortavelmente.       |
| 200                 | 150                                      | Strings inline longas como nomes completos de produtos em ANSI Shadow cabem. |

Duas implicações práticas ao projetar sua arte:

1. **Uma marca com várias palavras geralmente não renderizará como uma única linha ANSI Shadow na maioria dos terminais.** Com ~7–9 cols por letra ANSI Shadow, mesmo uma marca de 12 caracteres como `Custom Agent` tem aproximadamente 95 cols de arte em uma linha — já mais do que um terminal de 100 cols pode dispor ao lado do painel de informações. Empilhe as palavras em várias linhas, escolha uma fonte figlet mais densa ou use uma decoração de texto compacta de linha única como `▶ Custom Agent ◀`.
2. **Use a forma ciente de largura `{ small, large }`** quando um único nível forçaria você a escolher entre "parece ótimo largo / morre estreito" e "parece ok estreito / desperdiça espaço largo". O exemplo abaixo empilha as palavras para um terminal ≥104 cols em `large` e recai para uma decoração de linha única de 16 cols em `small`.

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

Onde `banner-large.txt` contém a saída ANSI Shadow com palavras empilhadas (~54 cols × 12 linhas), por exemplo, gerado por:

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

1. Salve `settings.json` e inicie uma nova sessão `qwen` — a resolução do banner é executada uma vez na inicialização.
2. Redimensione o terminal para confirmar que os níveis `small` / `large` trocam conforme o esperado e que a coluna do logotipo desaparece em larguras muito estreitas.
3. Se algo não aparecer como esperado, veja `~/.qwen/debug/<sessionId>.txt` (o link simbólico `latest.txt` aponta para a sessão atual) e pesquise por `[BANNER]` — cada falha suave registra uma linha de aviso com o motivo subjacente.

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
O algoritmo de resolução de cinco etapas é executado uma vez quando as configurações são carregadas e novamente apenas em eventos de recarregamento das configurações:

1. **Normalizar**. Uma `string` simples ou `{ path }` se torna `{ small: x, large: x }`. Um objeto `{ small, large }` passa diretamente.
2. **Resolver cada nível**. Para cada `AsciiArtSource`:
   - Se for uma string, use-a como está.
   - Se for `{ path }`, leia o arquivo de forma síncrona com proteção `O_NOFOLLOW` (Windows: somente leitura comum — a constante não é exposta), limitado a 64 KB. Caminhos relativos são resolvidos em relação ao _diretório do arquivo de configurações proprietário_ — configurações do workspace em relação ao `.qwen/` do workspace, configurações do usuário em relação a `~/.qwen/`. Em caso de falha de leitura, registra um aviso `[BANNER]` e recorre ao padrão para aquele nível.
3. **Sanitizar**. Um removedor específico de banner descarta líderes OSC / CSI / SS2 / SS3 e substitui todos os outros bytes de controle C0 / C1 (e DEL) por um espaço, preservando `\n` para que a arte multilinha sobreviva. Remove espaços em branco finais por linha e, em seguida, limita a 200 linhas × 200 colunas. Qualquer coisa além do limite é truncada e um aviso `[BANNER]` é registrado.
4. **Seleção de nível em tempo de renderização**. Em `Header.tsx`, dado o `small` e `large` resolvidos, avalie o orçamento de largura existente (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Prefira `large` se couber.
   - Caso contrário, recorra a `small` se couber.
   - Caso contrário, **se o usuário forneceu qualquer arte personalizada**, oculte a coluna do logotipo completamente (o branch existente `showLogo = false`) — recorrer ao logotipo QWEN embutido aqui desfaria silenciosamente uma implantação de marca própria em terminais estreitos. O painel de informações ainda é renderizado.
   - Caso contrário (nenhuma arte personalizada foi fornecida) passe para `shortAsciiLogo` e deixe o portão de largura existente decidir se deve mostrar ou ocultar o logotipo padrão.
5. **Fallback**. Se ambos os níveis ficarem vazios ou inválidos devido a falhas suaves (arquivo ausente, sanitização rejeitou tudo, configuração malformada), comporte-se como se nenhuma personalização tivesse sido definida: renderize `shortAsciiLogo` e siga o portão de largura do logotipo padrão. A CLI nunca deve travar em um erro de configuração de banner.

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
  return undefined; // coluna do logotipo oculta
}
```

## Adições ao esquema de configurações

Quatro novas propriedades são acrescentadas ao objeto `ui` em `packages/cli/src/config/settingsSchema.ts`, imediatamente após `shellOutputMaxLines`:

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
  // The runtime accepts a union the SettingDefinition `type` field can't
  // express. The override is emitted verbatim by the JSON-schema generator
  // so VS Code accepts every documented shape (string, {path}, or
  // {small,large}) without flagging the bare-string form.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` espelha o padrão existente `hideTips` (`showInDialog: true`). Os três campos de formato livre (título, subtítulo, arte) permanecem fora da caixa de diálogo de configurações do aplicativo porque um editor ASCII multilinha na caixa de diálogo TUI é um projeto em si; usuários avançados editam `settings.json` diretamente.

## Alterações de integração

Os pontos de contato da implementação são pequenos. Cada um é descrito abaixo com o arquivo e a faixa de linhas do `main` atual.

`packages/cli/src/ui/components/AppHeader.tsx:53` — estender `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — passar o banner resolvido para `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` — escolher o nível antes de calcular `logoWidth`, com o padrão existente como piso:

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

`packages/cli/src/ui/components/Header.tsx` — renderizar o título a partir da prop e usar a prop de subtítulo no lugar da linha de espaçador em branco quando definida:

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

**Novo arquivo**: `packages/cli/src/ui/utils/customBanner.ts` — o resolvedor. Exporta:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

O resolvedor realiza a normalização, leitura de arquivos, sanitização e cache descritos no pipeline de resolução acima. É chamado uma vez durante a inicialização da CLI e reexecutado em eventos de hot-reload das configurações. Caminhos de arquivo por escopo vêm de `settings.system.path` / `settings.workspace.path` / `settings.user.path` diretamente, de modo que cada `{ path }` é resolvido em relação ao arquivo que o declarou; as configurações do workspace são ignoradas completamente quando `settings.isTrusted` é falso.

## Abordagens alternativas consideradas

Cinco formas deste recurso foram consideradas. Elas estão listadas aqui para que futuros contribuidores entendam o espaço de design e possam revisitar a escolha se as restrições mudarem.

### Opção 1 — Três configurações planas (RECOMENDADO, corresponde ao issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Efeito**: superfície mínima voltada ao usuário; exatamente o que o issue pede.
- **Prós**: zero curva de aprendizado; trivialmente documentado; consistente com outras propriedades planas existentes em `ui.*` (`hideTips`, `customWittyPhrases`, etc.).
- **Contras**: três chaves de alto nível que conceitualmente pertencem juntas não são agrupadas; futuros controles apenas de banner (gradiente, subtítulo) adicionariam mais irmãos a `ui` em vez de aninhar de forma limpa.

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
- **Prós**: namespace limpo para futuros controles apenas de banner; descoberta mais fácil via `/settings`.
- **Contras**: diverge do texto exato do issue; as configurações de UI existentes são majoritariamente planas (apenas `ui.accessibility` e `ui.statusLine` aninham), então a consistência é mista; adiciona um nível de aninhamento para o usuário lembrar.

### Opção 3 — Perfis de banner predefinidos + substituições de slots

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* substituições de slot para 'branded' */ }
  }
}
```

- **Efeito**: usuários escolhem entre predefinições nomeadas; usuários avançados substituem slots dentro de um perfil escolhido.
- **Prós**: boa UX de integração; predefinições acompanham a CLI.
- **Contras**: complexidade significativa; predefinições são um compromisso de manutenção; o issue pede personalização bruta, não curadoria.

### Opção 4 — Substituição total do banner (template de string única)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Efeito**: template livre único com variáveis fixas preenchidas.
- **Prós**: máxima flexibilidade para layouts não padrão.
- **Contras**: reimplementa layout no espaço do usuário; perde a resiliência de duas colunas do Ink à largura do terminal; muito fácil escrever um template que quebre em terminais estreitos; grande raio de explosão para um recurso pequeno.

### Opção 5 — Plugin / hook API

Expor um hook de renderização de banner através do sistema de extensões.

- **Efeito**: personalização no nível de código; extensões podem renderizar qualquer coisa.
- **Prós**: máximo poder; permite que empresas enviem um plugin de branding lacrado.
- **Contras**: grande superfície de API; precisa de revisão de segurança para renderização arbitrária de terminal; enormemente escopo excessivo para o issue.

### Recomendação

**Opção 1** é recomendada. Ela atende ao issue literalmente, se encaixa no estilo existente `ui.*` e evita forçar uma decisão de namespace aninhado antes de sabermos como seriam realmente outros controles apenas de banner. Se futuros irmãos começarem a se acumular, migrar para a Opção 2 é aditivo — `ui.banner.title` e `ui.customBannerTitle` podem coexistir durante uma janela de depreciação.

## Segurança & tratamento de falhas

O conteúdo do banner personalizado é renderizado textualmente no terminal E, na forma de caminho, lido do disco. Ambas as superfícies são atingíveis por ataque se um arquivo de configurações hostil ou comprometido for carregado. O mesmo modelo de ameaça que impulsiona o recurso de título de sessão se aplica aqui.

| Preocupação                                                 | Proteção                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injeção ANSI / OSC-8 / CSI na arte, título ou subtítulo    | Removedor específico de banner (`sanitizeArt` / `sanitizeSingleLine`): descarta líderes OSC / CSI / SS2 / SS3 e substitui todos os outros bytes de controle C0 / C1 (e DEL) por um espaço. Aplicado antes da renderização e da gravação em cache.                          |
| Arquivo grande congela a inicialização                     | Limite rígido de 64 KB em leituras de arquivo.                                                                                                                                                                                                                            |
| Arte patológica congela o layout                           | Limite de 200 linhas × 200 colunas em cada string resolvida. O excesso é truncado; um aviso `[BANNER]` é registrado.                                                                                                                                                       |
| Redirecionamento de symlink na forma de caminho            | `O_NOFOLLOW` em leituras de arquivo (Windows: somente leitura comum; constante não exposta).                                                                                                                                                                               |
| Arquivo ausente ou ilegível                                | Capturar, registrar aviso `[BANNER]`, recorrer ao padrão. Nunca lançar exceção na UI.                                                                                                                                                                                      |
| Título ou subtítulo com quebras de linha / comprimento excessivo | Quebras de linha convertidas em espaços; limitado a 80 (título) / 160 (subtítulo) caracteres.                                                                                                                                                                              |
| Workspace não confiável influenciando renderização ou leituras de arquivo | Quando `settings.isTrusted` é falso, o resolvedor ignora `settings.workspace` completamente (espelha o portão de confiança que `settings.merged` aplica).                                                                                                                   |
| Condição de corrida no recarregamento de configurações     | A resolução é memorizada por fonte (hash de caminho ou string) por chamada. Recarregamentos reexecutam o resolvedor e releem os arquivos afetados.                                                                                                                          |

Resumo dos modos de falha: toda falha suave termina em `shortAsciiLogo` (ou o título padrão bloqueado) mais um aviso no log de depuração. Falhas graves (exceções lançadas) não são permitidas em nenhum branch do resolvedor.

## Fora do escopo

Estes foram considerados e deliberadamente adiados. Cada um pode ser um acompanhamento separado se a demanda do usuário surgir.

| Item                                                                        | Por que não                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderização texto-para-ASCII (forma `{ text: "xxxCode" }`)                 | Considerado e rejeitado para v1. Adicionar isso exigiria uma dependência de runtime `figlet` (~2–3 MB descompactados quando um conjunto utilizável de fontes é incluído) ou um renderizador de fonte única fornecido (~200 linhas + um arquivo `.flf` que possuiríamos). Ambas as opções trazem área de superfície contínua: seleção de fonte, rastreamento de licença de fonte, problemas "minha fonte não renderiza corretamente no terminal X" e tratamento de CJK / caracteres largos. O caso de uso principal para este recurso (marca própria / multi-inquilino) quase sempre tem um designer produzindo arte ASCII intencional, não dependendo de uma fonte figlet padrão. Usuários que desejam geração de uma linha já podem obtê-la com `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — mesmo resultado, sem dependência adicional, sem ônus de suporte dentro do Qwen Code. Se a demanda surgir mais tarde, esta forma é puramente aditiva: estender `AsciiArtSource` para `string \| {path} \| {text, font?}` sem quebrar nenhuma configuração existente. |
| Comando `/banner` para edição ao vivo                                       | A UI de configurações é a superfície de edição canônica. Um editor ao vivo para arte ASCII multilinha é um projeto em si.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Cores de gradiente personalizadas / substituições de cor por linha          | O tema é o proprietário das cores. Uma proposta separada pode estender o contrato do tema; a personalização do banner não deve duplicar essa superfície.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Arte ASCII carregada por URL                                                | Busca de rede na inicialização é uma caixa de Pandora — modos de falha, cache, revisão de segurança. A forma de caminho de arquivo é o equivalente de menor risco.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Animação (logotipo girando, título em marquee)                              | Adiciona carga de renderização e preocupações de acessibilidade; nada nos casos de uso exige isso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Paridade de banner do VSCode / Web UI                                      | Essas superfícies não renderizam o banner Ink hoje. Se elas crescerem um banner, este design é a referência.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Recarregamento dinâmico na mudança de arquivo                               | O resolvedor é executado na inicialização e apenas no recarregamento de configurações. Mudanças de arte no meio da sessão são raras o suficiente para que "reiniciar para ter efeito" seja a troca aceitável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Ocultar apenas regiões individuais bloqueadas (versão, autenticação, modelo, caminho) | Estes são sinais operacionais; suprimi-los prejudica o suporte e a postura de segurança mais do que ajuda cenários de marca própria.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
## Plano de verificação

Para o PR de implementação final, as seguintes verificações de ponta a ponta
devem passar.

1. `~/.qwen/settings.json` com `customBannerTitle: "Acme CLI"` e uma
   string `customAsciiArt` inline → `qwen` mostra o novo título e arte;
   sufixo de versão ainda presente.
2. `customBannerSubtitle: "Built-in Acme Skills"` → a linha de subtítulo
   é renderizada entre o título e a linha de auth/model na cor de texto
   secundária; auth, model e path ainda visíveis. Removê-lo restaura a
   linha de espaço vazio (back-compat).
3. `hideBanner: true` → `qwen` inicia sem banner; dicas e chat são
   renderizados normalmente.
4. `customAsciiArt: { "path": "./brand.txt" }` em um `settings.json` do
   workspace, com `brand.txt` ao lado em `.qwen/` → carrega do disco ao
   abrir o workspace.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensione o
   terminal entre largo / médio / estreito; large em larguras largas,
   small em larguras médias, coluna do logo oculta em larguras estreitas,
   painel de informações sempre visível.
6. Injete `\x1b[31mhostile` em `customBannerTitle` _e_
   `customBannerSubtitle` → ambos são renderizados como texto literal,
   não interpretados como vermelho.
7. Aponte `path` para um arquivo ausente → CLI inicia; aviso `[BANNER]`
   aparece em `~/.qwen/debug/<sessionId>.txt`; arte padrão é renderizada.
8. Abra a worktree com confiança no workspace desativada → o
   `customAsciiArt` definido no workspace (incluindo entradas `{ path }`)
   é silenciosamente ignorado; as configurações do escopo do usuário
   ainda se aplicam.
9. `npm test` e `npm run typecheck` passam para o pacote CLI; testes
   unitários em `customBanner.test.ts` cobrem cada formato aceito e cada
   caminho de falha (arquivo ausente, arquivo muito grande, injeção ANSI,
   objeto malformado).
# Temas

O Qwen Code suporta uma variedade de temas para personalizar seu esquema de cores e aparência. Você pode alterar o tema de acordo com suas preferências através do comando `/theme` ou da configuração `"theme":`.

## Temas Disponíveis

O Qwen Code vem com uma seleção de temas predefinidos, que você pode listar usando o comando `/theme` dentro do CLI:

- **Temas Escuros:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **Temas Claros:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### Alterando Temas

1. Digite `/theme` no Qwen Code.
2. Uma caixa de diálogo ou prompt de seleção será exibido, listando os temas disponíveis.
3. Utilize as setas do teclado para selecionar um tema. Algumas interfaces podem oferecer uma prévia ao vivo ou realçar o tema conforme você o seleciona.
4. Confirme sua seleção para aplicar o tema.

**Nota:** Se um tema estiver definido no seu arquivo `settings.json` (seja por nome ou por caminho de arquivo), você deverá remover a configuração `"theme"` desse arquivo antes de conseguir alterar o tema usando o comando `/theme`.

### Persistência de Temas

Os temas selecionados são salvos na [configuração](./configuration.md) do Qwen Code, para que sua preferência seja mantida entre as sessões.

---

## Temas de Cores Personalizados

O Qwen Code permite que você crie seus próprios temas de cores personalizados especificando-os no arquivo `settings.json`. Isso oferece controle total sobre a paleta de cores utilizada na CLI.

### Como Definir um Tema Customizado

Adicione um bloco `customThemes` ao seu arquivo `settings.json` de usuário, projeto ou sistema. Cada tema customizado é definido como um objeto com um nome único e um conjunto de chaves de cores. Por exemplo:

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "Background": "#181818",
        ...
      }
    }
  }
}
```

**Chaves de cores:**

- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`
- `DiffAdded` (opcional, para linhas adicionadas em diffs)
- `DiffRemoved` (opcional, para linhas removidas em diffs)
- `DiffModified` (opcional, para linhas modificadas em diffs)

**Propriedades obrigatórias:**

- `name` (deve corresponder à chave no objeto `customThemes` e ser uma string)
- `type` (deve ser a string `"custom"`)
- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`

Você pode usar códigos hexadecimais (ex: `#FF0000`) **ou** nomes padrão de cores CSS (ex: `coral`, `teal`, `blue`) para qualquer valor de cor. Veja [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) para uma lista completa dos nomes suportados.

Você pode definir múltiplos temas customizados adicionando mais entradas ao objeto `customThemes`.

### Carregando Temas de um Arquivo

Além de definir temas personalizados no `settings.json`, você também pode carregar um tema diretamente de um arquivo JSON especificando o caminho do arquivo no seu `settings.json`. Isso é útil para compartilhar temas ou mantê-los separados da sua configuração principal.

Para carregar um tema de um arquivo, defina a propriedade `theme` no seu `settings.json` com o caminho do seu arquivo de tema:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

O arquivo de tema deve ser um arquivo JSON válido que siga a mesma estrutura de um tema personalizado definido no `settings.json`.

**Exemplo `my-theme.json`:**

```json
{
  "name": "My File Theme",
  "type": "custom",
  "Background": "#282A36",
  "Foreground": "#F8F8F2",
  "LightBlue": "#82AAFF",
  "AccentBlue": "#61AFEF",
  "AccentPurple": "#BD93F9",
  "AccentCyan": "#8BE9FD",
  "AccentGreen": "#50FA7B",
  "AccentYellow": "#F1FA8C",
  "AccentRed": "#FF5555",
  "Comment": "#6272A4",
  "Gray": "#ABB2BF",
  "DiffAdded": "#A6E3A1",
  "DiffRemoved": "#F38BA8",
  "DiffModified": "#89B4FA",
  "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
}
```

**Nota de Segurança:** Para sua segurança, o Gemini CLI só carregará arquivos de tema que estejam localizados dentro do seu diretório home. Se você tentar carregar um tema de fora do seu diretório home, um aviso será exibido e o tema não será carregado. Isso evita o carregamento de arquivos de tema potencialmente maliciosos de fontes não confiáveis.

### Exemplo de Tema Customizado

<img src="../assets/theme-custom.png" alt="Exemplo de tema customizado" width="600" />

### Usando seu Tema Customizado

- Selecione seu tema customizado usando o comando `/theme` no Qwen Code. Seu tema customizado aparecerá no diálogo de seleção de temas.
- Ou, defina-o como padrão adicionando `"theme": "MyCustomTheme"` ao objeto `ui` no seu `settings.json`.
- Temas customizados podem ser definidos no nível do usuário, projeto ou sistema, e seguem a mesma [precedência de configuração](./configuration.md) que outras configurações.

---

## Temas Escuros

### ANSI

<img src="../assets/theme-ansi.png" alt="Tema ANSI" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Tema Atom One" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Tema Ayu" width="600">

### Padrão

<img src="../assets/theme-default.png" alt="Tema padrão" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Tema Dracula" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="Tema do GitHub" width="600">

## Temas Claros

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="Tema ANSI Light" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Tema Ayu Light" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Tema Default Light" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="Tema GitHub Light" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Tema Google Code" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Tema Xcode Light" width="600">
---
description: "Personalize temas e cores do Qwen Code para melhorar a leitura no terminal, longas sessões de programação com IA e demonstrações para a equipe."
---

# Temas

O Qwen Code oferece uma variedade de temas para personalizar seu esquema de cores e aparência. Você pode alterar o tema de acordo com suas preferências usando o comando `/theme` ou a configuração `"theme":`.

## Temas Disponíveis

O Qwen Code inclui uma seleção de temas predefinidos, que você pode listar usando o comando `/theme` na CLI:

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

1.  Digite `/theme` no Qwen Code.
2.  Uma caixa de diálogo ou prompt de seleção aparecerá, listando os temas disponíveis.
3.  Use as setas do teclado para selecionar um tema. Algumas interfaces podem oferecer uma pré-visualização em tempo real ou destaque durante a seleção.
4.  Confirme sua seleção para aplicar o tema.

**Nota:** Se um tema estiver definido no seu arquivo `settings.json` (seja pelo nome ou por um caminho de arquivo), você deve remover a configuração `"theme"` do arquivo antes de poder alterar o tema usando o comando `/theme`.

### Persistência do Tema

Os temas selecionados são salvos na [configuração](../configuration/settings) do Qwen Code, garantindo que sua preferência seja mantida entre as sessões.

---

## Temas de Cores Personalizados

O Qwen Code permite que você crie seus próprios temas de cores personalizados especificando-os no arquivo `settings.json`. Isso oferece controle total sobre a paleta de cores usada na CLI.

### Como Definir um Tema Personalizado

Adicione um bloco `customThemes` ao seu arquivo `settings.json` de usuário, projeto ou sistema. Cada tema personalizado é definido como um objeto com um nome exclusivo e um conjunto de chaves de cor. Por exemplo:

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

**Chaves de cor:**

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

**Propriedades Obrigatórias:**

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

Você pode usar códigos hexadecimais (ex.: `#FF0000`) **ou** nomes de cores CSS padrão (ex.: `coral`, `teal`, `blue`) para qualquer valor de cor. Consulte [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) para a lista completa de nomes suportados.

Você pode definir vários temas personalizados adicionando mais entradas ao objeto `customThemes`.

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

O arquivo de tema deve ser um JSON válido que siga a mesma estrutura de um tema personalizado definido no `settings.json`.

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

**Nota de Segurança:** Para sua segurança, o Gemini CLI carregará apenas arquivos de tema localizados dentro do seu diretório home. Se você tentar carregar um tema de fora do diretório home, um aviso será exibido e o tema não será carregado. Isso evita o carregamento de arquivos de tema potencialmente maliciosos de fontes não confiáveis.

### Exemplo de Tema Personalizado

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Usando Seu Tema Personalizado

- Selecione seu tema personalizado usando o comando `/theme` no Qwen Code. Seu tema personalizado aparecerá na caixa de diálogo de seleção de temas.
- Ou defina-o como padrão adicionando `"theme": "MyCustomTheme"` ao objeto `ui` no seu `settings.json`.
- Temas personalizados podem ser definidos no nível de usuário, projeto ou sistema e seguem a mesma [precedência de configuração](../configuration/settings) das demais configurações.

## Pré-visualização dos Temas

|  Tema Escuro  |                                                                                Preview                                                                                |  Tema Claro  |                                                                                Preview                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
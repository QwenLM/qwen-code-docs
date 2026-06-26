# Integração com IDE

O Qwen Code pode ser integrado com sua IDE para proporcionar uma experiência mais fluida e consciente do contexto. Essa integração permite que a CLI entenda melhor seu espaço de trabalho e habilita recursos poderosos, como a visualização nativa de diffs no editor.

Atualmente, a única IDE compatível é o [Visual Studio Code](https://code.visualstudio.com/) e outros editores que suportam extensões do VS Code. Para criar suporte a outros editores, consulte a [Especificação da Extensão Companheira da IDE](../ide-integration/ide-companion-spec).

## Recursos

- **Contexto do Espaço de Trabalho:** A CLI automaticamente obtém conhecimento do seu espaço de trabalho para fornecer respostas mais relevantes e precisas. Esse contexto inclui:
  - Os **10 arquivos acessados mais recentemente** no seu espaço de trabalho.
  - Sua posição ativa do cursor.
  - Qualquer texto que você tenha selecionado (com limite de 16 KB; seleções maiores serão truncadas).

- **Diffs Nativos:** Quando o Qwen sugere modificações no código, você pode visualizar as alterações diretamente no visualizador de diffs nativo da sua IDE. Isso permite revisar, editar e aceitar ou rejeitar as alterações sugeridas de forma integrada.

- **Comandos do VS Code:** Você pode acessar os recursos do Qwen Code diretamente da Paleta de Comandos do VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`):
  - `Qwen Code: Run`: Inicia uma nova sessão do Qwen Code no terminal integrado.
  - `Qwen Code: Accept Diff`: Aceita as alterações no editor de diff ativo.
  - `Qwen Code: Close Diff Editor`: Rejeita as alterações e fecha o editor de diff ativo.
  - `Qwen Code: View Third-Party Notices`: Exibe os avisos de terceiros da extensão.

## Instalação e Configuração

Existem três maneiras de configurar a integração com a IDE:

### 1. Sugestão Automática (Recomendado)

Quando você executa o Qwen Code dentro de um editor compatível, ele detecta automaticamente seu ambiente e solicita a conexão. Responder "Sim" executará automaticamente a configuração necessária, que inclui instalar a extensão companheira e ativar a conexão.

### 2. Instalação Manual pela CLI

Se você dispensou o aviso anteriormente ou prefere instalar a extensão manualmente, execute o seguinte comando dentro do Qwen Code:

```
/ide install
```

Isso encontrará a extensão correta para sua IDE e a instalará.

### 3. Instalação Manual por um Marketplace

Você também pode instalar a extensão diretamente de um marketplace.

- **Para Visual Studio Code:** Instale pelo [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Para Forks do VS Code:** Para dar suporte a forks do VS Code, a extensão também é publicada no [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Siga as instruções do seu editor para instalar extensões desse registro.

> [!NOTE]
> A extensão "Qwen Code Companion" pode aparecer no final dos resultados da pesquisa. Se você não a vir imediatamente, tente rolar para baixo ou ordenar por "Publicado recentemente".
>
> Após instalar a extensão manualmente, você deve executar `/ide enable` na CLI para ativar a integração.

## Uso

### Ativando e Desativando

Você pode controlar a integração com a IDE diretamente da CLI:

- Para ativar a conexão com a IDE, execute:
  ```
  /ide enable
  ```
- Para desativar a conexão, execute:
  ```
  /ide disable
  ```

Quando ativada, o Qwen Code tentará automaticamente se conectar à extensão companheira da IDE.

### Verificando o Status

Para verificar o status da conexão e visualizar o contexto que a CLI recebeu da IDE, execute:

```
/ide status
```

Se conectado, este comando mostrará a IDE à qual está conectado e uma lista dos arquivos abertos recentemente dos quais tem conhecimento.

(Observação: A lista de arquivos é limitada a 10 arquivos acessados recentemente dentro do seu espaço de trabalho e inclui apenas arquivos locais no disco.)

### Trabalhando com Diffs

Quando você pede ao modelo Qwen para modificar um arquivo, ele pode abrir uma visualização de diff diretamente no seu editor.

**Para aceitar um diff**, você pode executar qualquer uma das seguintes ações:

- Clique no **ícone de visto** na barra de título do editor de diff.
- Salve o arquivo (por exemplo, com `Cmd+S` ou `Ctrl+S`).
- Abra a Paleta de Comandos e execute **Qwen Code: Accept Diff**.
- Responda com `yes` na CLI quando for perguntado.

**Para rejeitar um diff**, você pode:

- Clique no **ícone 'x'** na barra de título do editor de diff.
- Feche a aba do editor de diff.
- Abra a Paleta de Comandos e execute **Qwen Code: Close Diff Editor**.
- Responda com `no` na CLI quando for perguntado.

Você também pode **modificar as alterações sugeridas** diretamente na visualização de diff antes de aceitá-las.

Se você selecionar 'Sim, permitir sempre' na CLI, as alterações não aparecerão mais na IDE, pois serão aceitas automaticamente.

## Usando com Sandboxing

Se você está usando o Qwen Code dentro de um sandbox, esteja ciente do seguinte:

- **No macOS:** A integração com a IDE requer acesso à rede para se comunicar com a extensão companheira. Você deve usar um perfil do Seatbelt que permita acesso à rede.
- **Em um Contêiner Docker:** Se você executar o Qwen Code dentro de um contêiner Docker (ou Podman), a integração com a IDE ainda pode se conectar à extensão do VS Code em execução na sua máquina host. A CLI é configurada para encontrar automaticamente o servidor da IDE em `host.docker.internal`. Geralmente, nenhuma configuração especial é necessária, mas talvez seja necessário garantir que a configuração de rede do Docker permita conexões do contêiner para o host.

## Solução de Problemas

Se você encontrar problemas com a integração com a IDE, aqui estão algumas mensagens de erro comuns e como resolvê-las.

### Erros de Conexão

- **Mensagem:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Causa:** O Qwen Code não conseguiu encontrar as variáveis de ambiente necessárias (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) para se conectar à IDE. Isso geralmente significa que a extensão companheira não está em execução ou não foi inicializada corretamente.
  - **Solução:**
    1.  Certifique-se de ter instalado a extensão **Qwen Code Companion** na sua IDE e que ela está ativada.
    2.  Abra uma nova janela de terminal na sua IDE para garantir que ela obtenha as variáveis de ambiente corretas.

- **Mensagem:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Causa:** A conexão com a extensão companheira da IDE foi perdida.
  - **Solução:** Execute `/ide enable` para tentar reconectar. Se o problema persistir, abra uma nova janela de terminal ou reinicie sua IDE.

### Erros de Configuração

- **Mensagem:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Causa:** O diretório de trabalho atual da CLI está fora da pasta ou espaço de trabalho que você tem aberto na sua IDE.
  - **Solução:** Use `cd` para ir para o mesmo diretório que está aberto na sua IDE e reinicie a CLI.

- **Mensagem:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Causa:** Você não tem nenhum espaço de trabalho aberto na sua IDE.
  - **Solução:** Abra um espaço de trabalho na sua IDE e reinicie a CLI.

### Erros Gerais

- **Mensagem:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Causa:** Você está executando o Qwen Code em um terminal ou ambiente que não é uma IDE compatível.
  - **Solução:** Execute o Qwen Code a partir do terminal integrado de uma IDE compatível, como o VS Code.

- **Mensagem:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Causa:** Você executou `/ide install`, mas a CLI não possui um instalador automatizado para sua IDE específica.
  - **Solução:** Abra o marketplace de extensões da sua IDE, pesquise por "Qwen Code Companion" e instale manualmente.
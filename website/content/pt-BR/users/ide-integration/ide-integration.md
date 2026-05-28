---
description: "Conecte o Qwen Code ao VS Code em minutos. Use contexto do workspace, revisão diff nativa e comandos da IDE para programação com IA sob controle."
---

# Integração com IDE

O Qwen Code pode se integrar à sua IDE para proporcionar uma experiência mais fluida e com maior consciência de contexto. Essa integração permite que a CLI compreenda melhor seu workspace e ative recursos poderosos, como diff nativo no editor.

Atualmente, a única IDE suportada é o [Visual Studio Code](https://code.visualstudio.com/) e outros editores que suportam extensões do VS Code. Para criar suporte a outros editores, consulte a [Especificação da Extensão Companion para IDE](../ide-integration/ide-companion-spec).

## Recursos

- **Contexto do Workspace:** A CLI obtém automaticamente consciência do seu workspace para fornecer respostas mais relevantes e precisas. Esse contexto inclui:
  - Os **10 arquivos acessados mais recentemente** no seu workspace.
  - A posição ativa do seu cursor.
  - Qualquer texto selecionado (com limite de 16KB; seleções maiores serão truncadas).

- **Diff Nativo:** Quando o Qwen sugere modificações de código, você pode visualizar as alterações diretamente no visualizador de diff nativo da sua IDE. Isso permite revisar, editar e aceitar ou rejeitar as alterações sugeridas de forma fluida.

- **Comandos do VS Code:** Você pode acessar os recursos do Qwen Code diretamente pela Paleta de Comandos do VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`):
  - `Qwen Code: Run`: Inicia uma nova sessão do Qwen Code no terminal integrado.
  - `Qwen Code: Accept Diff`: Aceita as alterações no editor de diff ativo.
  - `Qwen Code: Close Diff Editor`: Rejeita as alterações e fecha o editor de diff ativo.
  - `Qwen Code: View Third-Party Notices`: Exibe os avisos de terceiros da extensão.

## Instalação e Configuração

Existem três maneiras de configurar a integração com a IDE:

### 1. Sugestão Automática (Recomendado)

Ao executar o Qwen Code dentro de um editor suportado, ele detectará automaticamente seu ambiente e solicitará a conexão. Responder "Yes" executará automaticamente a configuração necessária, que inclui instalar a extensão companion e habilitar a conexão.

### 2. Instalação Manual pela CLI

Se você dispensou o prompt anteriormente ou deseja instalar a extensão manualmente, execute o seguinte comando dentro do Qwen Code:

```
/ide install
```

Isso encontrará a extensão correta para sua IDE e a instalará.

### 3. Instalação Manual por um Marketplace

Você também pode instalar a extensão diretamente por um marketplace.

- **Para Visual Studio Code:** Instale pelo [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Para Forks do VS Code:** Para oferecer suporte a forks do VS Code, a extensão também está publicada no [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Siga as instruções do seu editor para instalar extensões desse registry.

> [!note]
> A extensão "Qwen Code Companion" pode aparecer na parte inferior dos resultados de busca. Se você não a vir imediatamente, tente rolar para baixo ou classificar por "Newly Published".
>
> Após instalar a extensão manualmente, você deve executar `/ide enable` na CLI para ativar a integração.

## Uso

### Habilitando e Desabilitando

Você pode controlar a integração com a IDE diretamente pela CLI:

- Para habilitar a conexão com a IDE, execute:
  ```
  /ide enable
  ```
- Para desabilitar a conexão, execute:
  ```
  /ide disable
  ```

Quando habilitado, o Qwen Code tentará automaticamente se conectar à extensão companion da IDE.

### Verificando o Status

Para verificar o status da conexão e ver o contexto que a CLI recebeu da IDE, execute:

```
/ide status
```

Se estiver conectado, este comando mostrará a IDE à qual está conectado e uma lista dos arquivos abertos recentemente que ele conhece.

(Nota: A lista de arquivos é limitada a 10 arquivos acessados recentemente no seu workspace e inclui apenas arquivos locais no disco.)

### Trabalhando com Diffs

Quando você solicita ao modelo Qwen que modifique um arquivo, ele pode abrir uma visualização de diff diretamente no seu editor.

**Para aceitar um diff**, você pode realizar qualquer uma das seguintes ações:

- Clicar no **ícone de marca de seleção** na barra de título do editor de diff.
- Salvar o arquivo (por exemplo, com `Cmd+S` ou `Ctrl+S`).
- Abrir a Paleta de Comandos e executar **Qwen Code: Accept Diff**.
- Responder com `yes` na CLI quando solicitado.

**Para rejeitar um diff**, você pode:

- Clicar no **ícone 'x'** na barra de título do editor de diff.
- Fechar a aba do editor de diff.
- Abrir a Paleta de Comandos e executar **Qwen Code: Close Diff Editor**.
- Responder com `no` na CLI quando solicitado.

Você também pode **modificar as alterações sugeridas** diretamente na visualização de diff antes de aceitá-las.

Se você selecionar ‘Yes, allow always’ na CLI, as alterações não aparecerão mais na IDE, pois serão aceitas automaticamente.

## Uso com Sandboxing

Se você estiver usando o Qwen Code dentro de um sandbox, esteja ciente do seguinte:

- **No macOS:** A integração com a IDE requer acesso à rede para se comunicar com a extensão companion da IDE. Você deve usar um perfil Seatbelt que permita acesso à rede.
- **Em um Container Docker:** Se você executar o Qwen Code dentro de um container Docker (ou Podman), a integração com a IDE ainda poderá se conectar à extensão do VS Code em execução na sua máquina host. A CLI está configurada para encontrar automaticamente o servidor da IDE em `host.docker.internal`. Geralmente, nenhuma configuração especial é necessária, mas pode ser preciso garantir que sua configuração de rede do Docker permita conexões do container para o host.

## Solução de Problemas

Se você encontrar problemas com a integração da IDE, veja abaixo algumas mensagens de erro comuns e como resolvê-las.

### Erros de Conexão

- **Mensagem:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Causa:** O Qwen Code não conseguiu encontrar as variáveis de ambiente necessárias (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) para se conectar à IDE. Isso geralmente significa que a extensão companion da IDE não está em execução ou não foi inicializada corretamente.
  - **Solução:**
    1. Certifique-se de ter instalado a extensão **Qwen Code Companion** na sua IDE e de que ela está habilitada.
    2. Abra uma nova janela de terminal na sua IDE para garantir que ela capture o ambiente correto.

- **Mensagem:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Causa:** A conexão com a extensão companion da IDE foi perdida.
  - **Solução:** Execute `/ide enable` para tentar reconectar. Se o problema persistir, abra uma nova janela de terminal ou reinicie sua IDE.

### Erros de Configuração

- **Mensagem:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Causa:** O diretório de trabalho atual da CLI está fora da pasta ou workspace aberto na sua IDE.
  - **Solução:** Use `cd` para navegar até o mesmo diretório que está aberto na sua IDE e reinicie a CLI.

- **Mensagem:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Causa:** Você não tem nenhum workspace aberto na sua IDE.
  - **Solução:** Abra um workspace na sua IDE e reinicie a CLI.

### Erros Gerais

- **Mensagem:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Causa:** Você está executando o Qwen Code em um terminal ou ambiente que não é uma IDE suportada.
  - **Solução:** Execute o Qwen Code a partir do terminal integrado de uma IDE suportada, como o VS Code.

- **Mensagem:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Causa:** Você executou `/ide install`, mas a CLI não possui um instalador automatizado para sua IDE específica.
  - **Solução:** Abra o marketplace de extensões da sua IDE, pesquise por "Qwen Code Companion" e instale-a manualmente.
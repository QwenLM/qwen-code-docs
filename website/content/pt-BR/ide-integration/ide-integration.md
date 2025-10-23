# Integração com IDE

O Qwen Code pode se integrar com sua IDE para proporcionar uma experiência mais fluida e contextual. Essa integração permite que o CLI entenda melhor seu workspace e habilite recursos poderosos, como diff nativo diretamente no editor.

Atualmente, a única IDE suportada é o [Visual Studio Code](https://code.visualstudio.com/) e outros editores que suportam extensões do VS Code. Para desenvolver suporte a outros editores, consulte a [Especificação da Extensão Companion para IDE](./ide-companion-spec.md).

## Recursos

- **Contexto do Workspace:** O CLI automaticamente obtém conhecimento sobre o seu workspace para fornecer respostas mais relevantes e precisas. Esse contexto inclui:
  - Os **10 arquivos acessados mais recentemente** no seu workspace.
  - Sua posição atual do cursor.
  - Qualquer texto selecionado (até um limite de 16KB; seleções maiores serão truncadas).

- **Diff Nativo:** Quando o Qwen sugerir modificações no código, você poderá visualizar as alterações diretamente no visualizador de diff nativo da sua IDE. Isso permite revisar, editar e aceitar ou rejeitar as mudanças sugeridas de forma integrada.

- **Comandos do VS Code:** Você pode acessar os recursos do Qwen Code diretamente pela Paleta de Comandos do VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`):
  - `Qwen Code: Run`: Inicia uma nova sessão do Qwen Code no terminal integrado.
  - `Qwen Code: Accept Diff`: Aceita as alterações no editor de diff ativo.
  - `Qwen Code: Close Diff Editor`: Rejeita as alterações e fecha o editor de diff ativo.
  - `Qwen Code: View Third-Party Notices`: Exibe os avisos de terceiros para a extensão.

## Instalação e Configuração

Existem três maneiras de configurar a integração com o IDE:

### 1. Sugestão Automática (Recomendado)

Quando você executa o Qwen Code dentro de um editor compatível, ele vai detectar automaticamente seu ambiente e solicitar que você se conecte. Ao responder "Sim", a configuração necessária será executada automaticamente, incluindo a instalação da extensão complementar e a ativação da conexão.

### 2. Instalação Manual via CLI

Se você já ignorou a sugestão anterior ou prefere instalar a extensão manualmente, pode executar o seguinte comando dentro do Qwen Code:

```
/ide install
```

Esse comando identificará a extensão correta para o seu IDE e a instalará.

### 3. Instalação Manual a partir de um Marketplace

Você também pode instalar a extensão diretamente de um marketplace.

- **Para o Visual Studio Code:** Instale a partir do [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Para forks do VS Code:** Para dar suporte a forks do VS Code, a extensão também é publicada no [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Siga as instruções do seu editor para instalar extensões a partir deste registry.

> NOTA:
> A extensão "Qwen Code Companion" pode aparecer na parte inferior dos resultados de busca. Se não a vir imediatamente, tente rolar a página ou ordenar por "Newly Published".
>
> Após instalar manualmente a extensão, você deve executar `/ide enable` no CLI para ativar a integração.

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

Quando habilitada, o Qwen Code tentará se conectar automaticamente à extensão complementar da IDE.

### Verificando o Status

Para verificar o status da conexão e ver o contexto que a CLI recebeu da IDE, execute:

```
/ide status
```

Se estiver conectado, este comando mostrará a IDE à qual está conectado e uma lista dos arquivos recentemente abertos que ela conhece.

(Observação: A lista de arquivos é limitada a 10 arquivos acessados recentemente dentro do seu workspace e inclui apenas arquivos locais no disco.)

### Trabalhando com Diffs

Quando você pede ao modelo Qwen para modificar um arquivo, ele pode abrir uma visualização de diff diretamente no seu editor.

**Para aceitar um diff**, você pode realizar qualquer uma das seguintes ações:

- Clicar no **ícone de checkmark** na barra de título do editor de diff.
- Salvar o arquivo (por exemplo, com `Cmd+S` ou `Ctrl+S`).
- Abrir a Command Palette e executar **Qwen Code: Accept Diff**.
- Responder com `yes` no CLI quando solicitado.

**Para rejeitar um diff**, você pode:

- Clicar no **ícone 'x'** na barra de título do editor de diff.
- Fechar a aba do editor de diff.
- Abrir a Command Palette e executar **Qwen Code: Close Diff Editor**.
- Responder com `no` no CLI quando solicitado.

Você também pode **modificar as alterações sugeridas** diretamente na visualização de diff antes de aceitá-las.

Se você selecionar 'Yes, allow always' no CLI, as alterações não serão mais exibidas no IDE, pois serão aceitas automaticamente.

## Usando com Sandboxing

Se você estiver usando o Qwen Code dentro de um sandbox, esteja ciente do seguinte:

- **No macOS:** A integração com a IDE requer acesso à rede para se comunicar com a extensão complementar da IDE. Você deve usar um perfil Seatbelt que permita acesso à rede.
- **Em um Container Docker:** Se você executar o Qwen Code dentro de um container Docker (ou Podman), a integração com a IDE ainda poderá se conectar à extensão do VS Code rodando na sua máquina host. O CLI é configurado para encontrar automaticamente o servidor da IDE em `host.docker.internal`. Normalmente nenhuma configuração especial é necessária, mas talvez seja preciso garantir que sua configuração de rede do Docker permita conexões do container para o host.

## Troubleshooting

Se você encontrar problemas com a integração da IDE, aqui estão algumas mensagens de erro comuns e como resolvê-las.

### Erros de Conexão

- **Mensagem:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Causa:** O Qwen Code não conseguiu encontrar as variáveis de ambiente necessárias (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) para se conectar à IDE. Isso geralmente significa que a extensão complementar da IDE não está em execução ou não foi inicializada corretamente.
  - **Solução:**
    1.  Certifique-se de ter instalado a extensão **Qwen Code Companion** na sua IDE e de que ela está habilitada.
    2.  Abra uma nova janela de terminal na sua IDE para garantir que ela capture o ambiente correto.

- **Mensagem:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Causa:** A conexão com o complemento da IDE foi perdida.
  - **Solução:** Execute `/ide enable` para tentar reconectar. Se o problema persistir, abra uma nova janela de terminal ou reinicie sua IDE.

### Erros de Configuração

- **Mensagem:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Causa:** O diretório de trabalho atual do CLI está fora da pasta ou workspace aberta no seu IDE.
  - **Solução:** Use `cd` para entrar no mesmo diretório que está aberto no seu IDE e reinicie o CLI.

- **Mensagem:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Causa:** Você não tem nenhum workspace aberto no seu IDE.
  - **Solução:** Abra um workspace no seu IDE e reinicie o CLI.

### Erros Gerais

- **Mensagem:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Causa:** Você está executando o Qwen Code em um terminal ou ambiente que não é uma IDE suportada.
  - **Solução:** Execute o Qwen Code a partir do terminal integrado de uma IDE suportada, como o VS Code.

- **Mensagem:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Causa:** Você executou `/ide install`, mas o CLI não possui um instalador automático para a sua IDE específica.
  - **Solução:** Abra o marketplace de extensões da sua IDE, procure por "Qwen Code Companion" e instale-a manualmente.
# Integração com IDE

O Qwen Code pode se integrar com sua IDE para proporcionar uma experiência mais fluida e contextual. Essa integração permite que a CLI entenda melhor seu espaço de trabalho e habilite recursos poderosos, como diff nativo diretamente no editor.

Atualmente, a única IDE suportada é o [Visual Studio Code](https://code.visualstudio.com/) e outros editores que suportam extensões do VS Code. Para construir suporte a outros editores, consulte a [Especificação da Extensão Companheira para IDE](../ide-integration/ide-companion-spec).

## Recursos

- **Contexto do Workspace:** A CLI automaticamente obtém conhecimento do seu workspace para fornecer respostas mais relevantes e precisas. Este contexto inclui:
  - Os **10 arquivos mais recentemente acessados** no seu workspace.
  - Sua posição atual do cursor.
  - Qualquer texto selecionado (até um limite de 16KB; seleções maiores serão truncadas).

- **Diff Nativo:** Quando o Qwen sugerir modificações de código, você poderá visualizar as alterações diretamente no visualizador de diff nativo da sua IDE. Isso permite revisar, editar e aceitar ou rejeitar as mudanças sugeridas de forma integrada.

- **Comandos do VS Code:** Você pode acessar os recursos do Qwen Code diretamente da Paleta de Comandos do VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`):
  - `Qwen Code: Run`: Inicia uma nova sessão do Qwen Code no terminal integrado.
  - `Qwen Code: Accept Diff`: Aceita as alterações no editor de diff ativo.
  - `Qwen Code: Close Diff Editor`: Rejeita as alterações e fecha o editor de diff ativo.
  - `Qwen Code: View Third-Party Notices`: Exibe os avisos de terceiros para a extensão.

## Instalação e Configuração

Existem três maneiras de configurar a integração com o IDE:

### 1. Sugestão Automática (Recomendado)

Quando você executa o Qwen Code dentro de um editor compatível, ele detectará automaticamente seu ambiente e solicitará que você se conecte. Responder "Sim" executará automaticamente a configuração necessária, que inclui a instalação da extensão complementar e a ativação da conexão.

### 2. Instalação Manual via CLI

Se você ignorou anteriormente a solicitação ou deseja instalar a extensão manualmente, pode executar o seguinte comando dentro do Qwen Code:

```
/ide install
```

Isso encontrará a extensão correta para o seu IDE e a instalará.

### 3. Instalação Manual a partir de um Marketplace

Você também pode instalar a extensão diretamente de um marketplace.

- **Para o Visual Studio Code:** Instale a partir do [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Para Forks do VS Code:** Para dar suporte a forks do VS Code, a extensão também é publicada no [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Siga as instruções do seu editor para instalar extensões a partir deste registro.

> NOTA:
> A extensão "Qwen Code Companion" pode aparecer na parte inferior dos resultados da pesquisa. Se você não a vir imediatamente, tente rolar para baixo ou ordenar por "Novamente Publicado".
>
> Após instalar manualmente a extensão, você deve executar `/ide enable` na CLI para ativar a integração.

## Uso

### Ativando e Desativando

Você pode controlar a integração com o IDE diretamente pela CLI:

- Para ativar a conexão com o IDE, execute:
  ```
  /ide enable
  ```
- Para desativar a conexão, execute:
  ```
  /ide disable
  ```

Quando ativado, o Qwen Code tentará automaticamente se conectar à extensão complementar do IDE.

### Verificando o Status

Para verificar o status da conexão e ver o contexto que a CLI recebeu do IDE, execute:

```
/ide status
```

Se estiver conectado, este comando mostrará o IDE ao qual está conectado e uma lista dos arquivos recentemente abertos que ele conhece.

(Observação: A lista de arquivos é limitada a 10 arquivos acessados recentemente dentro do seu workspace e inclui apenas arquivos locais no disco.)

### Trabalhando com Diffs

Quando você pede ao modelo Qwen para modificar um arquivo, ele pode abrir uma visualização de diff diretamente no seu editor.

**Para aceitar um diff**, você pode realizar qualquer uma das seguintes ações:

- Clique no **ícone de marca de seleção** na barra de título do editor de diff.
- Salve o arquivo (por exemplo, com `Cmd+S` ou `Ctrl+S`).
- Abra a Paleta de Comandos e execute **Qwen Code: Accept Diff**.
- Responda com `yes` na CLI quando solicitado.

**Para rejeitar um diff**, você pode:

- Clique no **ícone 'x'** na barra de título do editor de diff.
- Feche a aba do editor de diff.
- Abra a Paleta de Comandos e execute **Qwen Code: Close Diff Editor**.
- Responda com `no` na CLI quando solicitado.

Você também pode **modificar as alterações sugeridas** diretamente na visualização de diff antes de aceitá-las.

Se você selecionar ‘Yes, allow always’ na CLI, as alterações não serão mais exibidas no IDE, pois serão aceitas automaticamente.

## Usando com Sandbox

Se você estiver usando o Qwen Code dentro de um sandbox, esteja ciente do seguinte:

- **No macOS:** A integração com o IDE requer acesso à rede para se comunicar com a extensão complementar do IDE. Você deve usar um perfil do Seatbelt que permita acesso à rede.
- **Em um Contêiner Docker:** Se você executar o Qwen Code dentro de um contêiner Docker (ou Podman), a integração com o IDE ainda poderá se conectar à extensão do VS Code em execução na sua máquina host. O CLI é configurado para encontrar automaticamente o servidor do IDE em `host.docker.internal`. Nenhuma configuração especial geralmente é necessária, mas talvez seja necessário garantir que sua configuração de rede do Docker permita conexões do contêiner ao host.

## Solução de Problemas

Se você encontrar problemas com a integração do IDE, aqui estão algumas mensagens de erro comuns e como resolvê-las.

### Erros de Conexão

- **Mensagem:** `🔴 Desconectado: Falha ao conectar-se à extensão complementar do IDE para [Nome do IDE]. Certifique-se de que a extensão está em execução e tente reiniciar seu terminal. Para instalar a extensão, execute /ide install.`
  - **Causa:** O Qwen Code não conseguiu encontrar as variáveis de ambiente necessárias (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) para se conectar ao IDE. Isso geralmente significa que a extensão complementar do IDE não está em execução ou não foi inicializada corretamente.
  - **Solução:**
    1.  Certifique-se de ter instalado a extensão **Qwen Code Companion** em seu IDE e de que ela está habilitada.
    2.  Abra uma nova janela de terminal em seu IDE para garantir que ele capture o ambiente correto.

- **Mensagem:** `🔴 Desconectado: Erro de conexão com o IDE. A conexão foi perdida inesperadamente. Tente reconectar executando /ide enable`
  - **Causa:** A conexão com o complemento do IDE foi perdida.
  - **Solução:** Execute `/ide enable` para tentar reconectar. Se o problema persistir, abra uma nova janela de terminal ou reinicie seu IDE.

### Erros de Configuração

- **Mensagem:** `🔴 Desconectado: Incompatibilidade de diretório. O Qwen Code está sendo executado em um local diferente do espaço de trabalho aberto no [IDE Name]. Por favor, execute o CLI a partir do mesmo diretório da pasta raiz do seu projeto.`
  - **Causa:** O diretório de trabalho atual do CLI está fora da pasta ou espaço de trabalho que você tem aberto no seu IDE.
  - **Solução:** Use `cd` para entrar no mesmo diretório que está aberto no seu IDE e reinicie o CLI.

- **Mensagem:** `🔴 Desconectado: Para usar este recurso, por favor abra uma pasta de espaço de trabalho no [IDE Name] e tente novamente.`
  - **Causa:** Você não tem nenhum espaço de trabalho aberto no seu IDE.
  - **Solução:** Abra um espaço de trabalho no seu IDE e reinicie o CLI.

### Erros Gerais

- **Mensagem:** `A integração com IDE não é compatível com seu ambiente atual. Para usar este recurso, execute o Qwen Code em uma das seguintes IDEs compatíveis: [Lista de IDEs]`
  - **Causa:** Você está executando o Qwen Code em um terminal ou ambiente que não é uma IDE compatível.
  - **Solução:** Execute o Qwen Code a partir do terminal integrado de uma IDE compatível, como o VS Code.

- **Mensagem:** `Nenhum instalador está disponível para a IDE. Por favor, instale a extensão Qwen Code Companion manualmente a partir do marketplace.`
  - **Causa:** Você executou `/ide install`, mas a CLI não possui um instalador automático para sua IDE específica.
  - **Solução:** Abra o marketplace de extensões da sua IDE, procure por "Qwen Code Companion" e instale-a manualmente.
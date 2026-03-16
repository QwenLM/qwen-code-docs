# Integração com IDE

O Qwen Code pode ser integrado à sua IDE para oferecer uma experiência mais fluida e adaptada ao contexto. Essa integração permite que a CLI entenda melhor seu ambiente de trabalho e habilite recursos avançados, como comparação de diferenças nativa diretamente no editor.

Atualmente, a única IDE suportada é o [Visual Studio Code](https://code.visualstudio.com/) e outros editores que suportam extensões do VS Code. Para implementar suporte a outros editores, consulte a [Especificação da Extensão Companheira para IDE](../ide-integration/ide-companion-spec).

## Recursos

- **Contexto do Workspace:** A CLI obtém automaticamente conhecimento sobre seu workspace para fornecer respostas mais relevantes e precisas. Esse contexto inclui:
  - Os **10 arquivos mais recentemente acessados** no seu workspace.
  - A posição atual do cursor.
  - Qualquer texto que você tenha selecionado (limite de 16 KB; seleções maiores serão truncadas).

- **Diferenciação Nativa:** Quando o Qwen sugere modificações de código, você pode visualizar as alterações diretamente no visualizador de diffs nativo do seu IDE. Isso permite revisar, editar e aceitar ou rejeitar as alterações sugeridas de forma contínua.

- **Comandos do VS Code:** Você pode acessar os recursos do Qwen Code diretamente pela Paleta de Comandos do VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`):
  - `Qwen Code: Executar`: Inicia uma nova sessão do Qwen Code no terminal integrado.
  - `Qwen Code: Aceitar Diff`: Aceita as alterações no editor de diff ativo.
  - `Qwen Code: Fechar Editor de Diff`: Rejeita as alterações e fecha o editor de diff ativo.
  - `Qwen Code: Visualizar Avisos de Terceiros`: Exibe os avisos de terceiros relacionados à extensão.

## Instalação e Configuração

Há três maneiras de configurar a integração com a IDE:

### 1. Notificação Automática (Recomendado)

Quando você executa o Qwen Code dentro de um editor compatível, ele detectará automaticamente seu ambiente e solicitará que você se conecte. Responder “Sim” executará automaticamente a configuração necessária, incluindo a instalação da extensão complementar e a ativação da conexão.

### 2. Instalação Manual via CLI

Se você ignorou anteriormente a notificação ou deseja instalar a extensão manualmente, pode executar o seguinte comando dentro do Qwen Code:

```
/ide install
```

Esse comando identificará a extensão correta para sua IDE e a instalará.

### 3. Instalação Manual a Partir de uma Loja de Extensões

Você também pode instalar a extensão diretamente de uma loja de extensões.

- **Para o Visual Studio Code:** Instale na [Loja de Extensões do VS Code](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Para forks do VS Code:** Para dar suporte a forks do VS Code, a extensão também está publicada no [Registro Open VSX](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Siga as instruções do seu editor para instalar extensões desse registro.

> NOTE:
> A extensão "Qwen Code Companion" pode aparecer próximo ao final dos resultados da pesquisa. Se você não a encontrar imediatamente, tente rolar para baixo ou ordenar os resultados por "Recém-publicado".
>
> Após instalar manualmente a extensão, você deve executar o comando `/ide enable` na CLI para ativar a integração.

## Uso

### Habilitando e Desabilitando

Você pode controlar a integração com a IDE diretamente pelo CLI:

- Para habilitar a conexão com a IDE, execute:
  ```
  /ide enable
  ```
- Para desabilitar a conexão, execute:
  ```
  /ide disable
  ```

Quando habilitada, o Qwen Code tentará automaticamente se conectar à extensão complementar da IDE.

### Verificando o Status

Para verificar o status da conexão e visualizar o contexto recebido pela CLI da IDE, execute:

```
/ide status
```

Se houver uma conexão ativa, este comando mostrará a IDE à qual está conectado e uma lista dos arquivos recentemente abertos de que ele tem conhecimento.

(Observação: A lista de arquivos é limitada aos 10 arquivos mais recentemente acessados no seu workspace e inclui apenas arquivos locais no disco.)

### Trabalhando com diffs

Quando você solicita ao modelo Qwen que modifique um arquivo, ele pode abrir uma visualização de diff diretamente no seu editor.

**Para aceitar um diff**, você pode executar qualquer uma das seguintes ações:

- Clicar no **ícone de marca de verificação** na barra de título do editor de diff.
- Salvar o arquivo (por exemplo, usando `Cmd+S` ou `Ctrl+S`).
- Abrir a paleta de comandos e executar **Qwen Code: Aceitar Diff**.
- Responder com `sim` no CLI quando solicitado.

**Para rejeitar um diff**, você pode:

- Clicar no **ícone 'x'** na barra de título do editor de diff.
- Fechar a guia do editor de diff.
- Abrir a paleta de comandos e executar **Qwen Code: Fechar Editor de Diff**.
- Responder com `não` no CLI quando solicitado.

Você também pode **modificar as alterações sugeridas** diretamente na visualização de diff antes de aceitá-las.

Se você selecionar ‘Sim, permitir sempre’ no CLI, as alterações deixarão de aparecer no IDE, pois serão aceitas automaticamente.

## Uso com sandboxing

Se você estiver usando o Qwen Code dentro de um sandbox, observe o seguinte:

- **No macOS:** A integração com a IDE exige acesso à rede para se comunicar com a extensão companheira da IDE. Você deve usar um perfil Seatbelt que permita o acesso à rede.
- **Em um contêiner Docker:** Se você executar o Qwen Code dentro de um contêiner Docker (ou Podman), a integração com a IDE ainda poderá se conectar à extensão do VS Code em execução na sua máquina host. A CLI é configurada para localizar automaticamente o servidor da IDE em `host.docker.internal`. Normalmente, nenhuma configuração especial é necessária, mas você pode precisar garantir que sua configuração de rede do Docker permita conexões do contêiner para a máquina host.

## Solução de problemas

Se você encontrar problemas com a integração da IDE, aqui estão algumas mensagens de erro comuns e como resolvê-las.

### Erros de Conexão

- **Mensagem:** `🔴 Desconectado: Falha ao conectar à extensão do companheiro IDE para [Nome da IDE]. Certifique-se de que a extensão está em execução e tente reiniciar seu terminal. Para instalar a extensão, execute /ide install.`
  - **Causa:** O Qwen Code não conseguiu encontrar as variáveis de ambiente necessárias (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) para se conectar à IDE. Isso geralmente significa que a extensão companheira da IDE não está em execução ou não foi inicializada corretamente.
  - **Solução:**
    1.  Certifique-se de que você instalou a extensão **Qwen Code Companion** na sua IDE e de que ela está habilitada.
    2.  Abra uma nova janela de terminal na sua IDE para garantir que ela carregue as variáveis de ambiente corretas.

- **Mensagem:** `🔴 Desconectado: Erro de conexão com a IDE. A conexão foi perdida inesperadamente. Tente reconectar executando /ide enable`
  - **Causa:** A conexão com a extensão companheira da IDE foi perdida.
  - **Solução:** Execute `/ide enable` para tentar reconectar. Se o problema persistir, abra uma nova janela de terminal ou reinicie sua IDE.

### Erros de Configuração

- **Mensagem:** `🔴 Desconectado: Incompatibilidade de diretório. O Qwen Code está sendo executado em um local diferente do workspace aberto no [Nome do IDE]. Execute a CLI a partir do mesmo diretório da pasta raiz do seu projeto.`
  - **Causa:** O diretório de trabalho atual da CLI está fora da pasta ou workspace aberta no seu IDE.
  - **Solução:** Use o comando `cd` para acessar o mesmo diretório que está aberto no seu IDE e reinicie a CLI.

- **Mensagem:** `🔴 Desconectado: Para usar esse recurso, abra uma pasta de workspace no [Nome do IDE] e tente novamente.`
  - **Causa:** Nenhum workspace está aberto no seu IDE.
  - **Solução:** Abra um workspace no seu IDE e reinicie a CLI.

### Erros Gerais

- **Mensagem:** `A integração com IDE não é compatível com o seu ambiente atual. Para usar esse recurso, execute o Qwen Code em um dos IDEs compatíveis: [Lista de IDEs]`
  - **Causa:** Você está executando o Qwen Code em um terminal ou ambiente que não é um IDE compatível.
  - **Solução:** Execute o Qwen Code a partir do terminal integrado de um IDE compatível, como o VS Code.

- **Mensagem:** `Nenhum instalador está disponível para o seu IDE. Instale manualmente a extensão Qwen Code Companion na loja de extensões.`
  - **Causa:** Você executou o comando `/ide install`, mas a CLI não possui um instalador automatizado para o seu IDE específico.
  - **Solução:** Abra a loja de extensões do seu IDE, pesquise por "Qwen Code Companion" e instale-a manualmente.
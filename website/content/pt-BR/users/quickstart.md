# Início rápido

> 👏 Bem-vindo ao Qwen Code!

Este guia de início rápido mostrará como usar a assistência de programação com IA em apenas alguns minutos. Ao final, você entenderá como usar o Qwen Code para tarefas comuns de desenvolvimento.

## Antes de começar

Certifique-se de ter:

- Um **terminal** ou prompt de comando aberto
- Um projeto de código para trabalhar
- Uma conta no [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Etapa 1: Instalar o Qwen Code

Para instalar o Qwen Code, use um dos seguintes métodos:

### Instalação rápida (Recomendado)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Executar como Administrador no CMD)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Recomenda-se reiniciar o terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor.

### Instalação manual

**Pré-requisitos**

Certifique-se de ter o Node.js 20 ou superior instalado. Baixe-o em [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Etapa 2: Fazer login na sua conta

O Qwen Code exige uma conta para ser usado. Ao iniciar uma sessão interativa com o comando `qwen`, você será solicitado a fazer login:

```bash
# Você será solicitado a fazer login no primeiro uso
qwen
```

```bash
# Siga as instruções para fazer login com sua conta
/auth
```

Selecione `Qwen OAuth`, faça login na sua conta e siga as instruções para confirmar. Após o login, suas credenciais serão armazenadas e você não precisará fazer login novamente.

> [!note]
>
> Na primeira vez que você autenticar o Qwen Code com sua conta Qwen, um workspace chamado ".qwen" será criado automaticamente para você. Esse workspace oferece rastreamento e gerenciamento centralizado de custos para todo o uso do Qwen Code na sua organização.

> [!tip]
>
> Você também pode configurar a autenticação diretamente pelo terminal, sem iniciar uma sessão, executando `qwen auth`. Use `qwen auth status` para verificar sua configuração atual a qualquer momento. Consulte a página [Autenticação](./configuration/auth) para mais detalhes.

## Etapa 3: Iniciar sua primeira sessão

Abra o terminal em qualquer diretório de projeto e inicie o Qwen Code:

```bash
# opcional
cd /path/to/your/project
# iniciar qwen
qwen
```

Você verá a tela de boas-vindas do Qwen Code com informações da sessão, conversas recentes e as últimas atualizações. Digite `/help` para ver os comandos disponíveis.

## Conversar com o Qwen Code

### Faça sua primeira pergunta

O Qwen Code analisará seus arquivos e fornecerá um resumo. Você também pode fazer perguntas mais específicas:

```
explain the folder structure
```

Você também pode perguntar ao Qwen Code sobre suas próprias capacidades:

```
what can Qwen Code do?
```

> [!note]
>
> O Qwen Code lê seus arquivos conforme necessário - você não precisa adicionar contexto manualmente. O Qwen Code também tem acesso à sua própria documentação e pode responder a perguntas sobre seus recursos e capacidades.

### Faça sua primeira alteração de código

Agora, vamos fazer o Qwen Code escrever código de verdade. Tente uma tarefa simples:

```
add a hello world function to the main file
```

O Qwen Code irá:

1. Encontrar o arquivo adequado
2. Mostrar as alterações propostas
3. Solicitar sua aprovação
4. Aplicar a edição

> [!note]
>
> O Qwen Code sempre pede permissão antes de modificar arquivos. Você pode aprovar alterações individuais ou ativar o modo "Aceitar tudo" para uma sessão.

### Usar Git com o Qwen Code

O Qwen Code torna as operações do Git conversacionais:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Você também pode solicitar operações mais complexas do Git:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Corrigir um bug ou adicionar um recurso

O Qwen Code é proficiente em depuração e implementação de recursos.

Descreva o que você deseja em linguagem natural:

```
add input validation to the user registration form
```

Ou corrija problemas existentes:

```
there's a bug where users can submit empty forms - fix it
```

O Qwen Code irá:

- Localizar o código relevante
- Compreender o contexto
- Implementar uma solução
- Executar testes, se disponíveis

### Testar outros fluxos de trabalho comuns

Existem várias maneiras de trabalhar com o Qwen Code:

**Refatorar código**

```
refactor the authentication module to use async/await instead of callbacks
```

**Escrever testes**

```
write unit tests for the calculator functions
```

**Atualizar documentação**

```
update the README with installation instructions
```

**Revisão de código**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Lembre-se**: o Qwen Code é seu par programador com IA. Converse com ele como faria com um colega prestativo - descreva o que deseja alcançar e ele ajudará você a chegar lá.

## Comandos essenciais

Aqui estão os comandos mais importantes para o uso diário:

| Comando               | O que faz                                          | Exemplo                       |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| `qwen`                | Iniciar o Qwen Code                                | `qwen`                        |
| `/auth`               | Alterar o método de autenticação (na sessão)       | `/auth`                       |
| `qwen auth`           | Configurar autenticação pelo terminal              | `qwen auth`                   |
| `qwen auth status`    | Verificar o status atual da autenticação           | `qwen auth status`            |
| `/help`               | Exibir informações de ajuda para comandos disponíveis | `/help` ou `/?`               |
| `/compress`           | Substituir o histórico do chat por um resumo para economizar Tokens | `/compress`                   |
| `/clear`              | Limpar o conteúdo da tela do terminal              | `/clear` (atalho: `Ctrl+L`)   |
| `/theme`              | Alterar o tema visual do Qwen Code                 | `/theme`                      |
| `/language`           | Visualizar ou alterar as configurações de idioma   | `/language`                   |
| → `ui [language]`     | Definir o idioma da interface do usuário           | `/language ui zh-CN`          |
| → `output [language]` | Definir o idioma de saída do LLM                   | `/language output Chinese`    |
| `/quit`               | Sair do Qwen Code imediatamente                    | `/quit` ou `/exit`            |

Consulte a [referência da CLI](./features/commands) para obter a lista completa de comandos.

## Dicas úteis para iniciantes

**Seja específico nas suas solicitações**

- Em vez de: "fix the bug"
- Tente: "fix the login bug where users see a blank screen after entering wrong credentials"

**Use instruções passo a passo**

- Divida tarefas complexas em etapas:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Deixe o Qwen Code explorar primeiro**

- Antes de fazer alterações, deixe o Qwen Code entender seu código:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Economize tempo com atalhos**

- Pressione `?` para ver todos os atalhos de teclado disponíveis
- Use Tab para autocompletar comandos
- Pressione ↑ para acessar o histórico de comandos
- Digite `/` para ver todos os comandos de barra

## Obter ajuda

- **No Qwen Code**: Digite `/help` ou pergunte "how do I..."
- **Documentação**: Você está aqui! Navegue por outros guias
- **Comunidade**: Participe da nossa [Discussão no GitHub](https://github.com/QwenLM/qwen-code/discussions) para dicas e suporte
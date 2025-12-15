# Início Rápido

> 👏 Bem-vindo ao Qwen Code!

Este guia de início rápido permitirá que você comece a usar a assistência de codificação com inteligência artificial em apenas alguns minutos. Ao final, você entenderá como usar o Qwen Code para tarefas comuns de desenvolvimento.

## Antes de começar

Certifique-se de ter:

- Um **terminal** ou prompt de comando aberto
- Um projeto de código para trabalhar
- Uma conta no [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Passo 1: Instalar o Qwen Code

Para instalar o Qwen Code, utilize um dos seguintes métodos:

### NPM (recomendado)

Requer [Node.js 20+](https://nodejs.org/download), você pode usar `node -v` para verificar a versão. Se não estiver instalado, utilize o seguinte comando para instalá-lo.

Se você tem o [Node.js ou uma versão mais recente instalada](https://nodejs.org/en/download/):

```sh
npm install -g @qwen-code/qwen-code@latest
```

### Homebrew (macOS, Linux)

```sh
brew install qwen-code
```

## Passo 2: Faça login na sua conta

O Qwen Code requer uma conta para ser utilizado. Quando você iniciar uma sessão interativa com o comando `qwen`, será necessário fazer login:

```bash

# Você será solicitado a fazer login no primeiro uso
qwen
```

```bash

# Siga as instruções para fazer login com sua conta
/auth
```

Selecione `Qwen OAuth`, faça login na sua conta e siga as instruções para confirmar. Uma vez logado, suas credenciais serão armazenadas e você não precisará fazer login novamente.

> [!note]
>
> Quando você autenticar o Qwen Code com sua conta Qwen pela primeira vez, um workspace chamado ".qwen" será criado automaticamente para você. Este workspace fornece rastreamento e gerenciamento centralizado de custos para todo o uso do Qwen Code em sua organização.

> [!tip]
>
> Se você precisar fazer login novamente ou trocar de conta, utilize o comando `/auth` dentro do Qwen Code.

## Passo 3: Inicie sua primeira sessão

Abra seu terminal em qualquer diretório de projeto e inicie o Qwen Code:

```bash

# opcional
cd /path/to/your/project

# iniciar qwen
qwen
```

Você verá a tela de boas-vindas do Qwen Code com informações da sua sessão, conversas recentes e últimas atualizações. Digite `/help` para ver os comandos disponíveis.

## Conversar com o Qwen Code

### Faça sua primeira pergunta

O Qwen Code analisará seus arquivos e fornecerá um resumo. Você também pode fazer perguntas mais específicas:

```
explique a estrutura de pastas
```

Você também pode perguntar ao Qwen Code sobre suas próprias capacidades:

```
o que o Qwen Code pode fazer?
```

> [!note]
>
> O Qwen Code lê seus arquivos conforme necessário - você não precisa adicionar contexto manualmente. O Qwen Code também tem acesso à sua própria documentação e pode responder perguntas sobre seus recursos e capacidades.

### Faça sua primeira alteração de código

Agora vamos fazer com que o Qwen Code realize algumas tarefas reais de programação. Tente uma tarefa simples:

```
adicione uma função hello world ao arquivo principal
```

O Qwen Code irá:

1. Encontrar o arquivo apropriado
2. Mostrar as alterações propostas
3. Pedir sua aprovação
4. Realizar a edição

> [!note]
>
> O Qwen Code sempre pede permissão antes de modificar arquivos. Você pode aprovar alterações individuais ou ativar o modo "Aceitar tudo" para uma sessão.

### Use o Git com o Qwen Code

O Qwen Code torna as operações do Git conversacionais:

```
quais arquivos eu modifiquei?
```

```
faça commit das minhas alterações com uma mensagem descritiva
```

Você também pode solicitar operações mais complexas do Git:

```
crie um novo branch chamado feature/quickstart
```

```
mostre os últimos 5 commits
```

```
ajude-me a resolver conflitos de merge
```

### Corrigir um bug ou adicionar uma funcionalidade

O Qwen Code é proficiente em depuração e implementação de funcionalidades.

Descreva o que você deseja em linguagem natural:

```
adicionar validação de entrada ao formulário de registro do usuário
```

Ou corrigir problemas existentes:

```
existe um bug onde os usuários podem enviar formulários vazios - corrija isso
```

O Qwen Code irá:

- Localizar o código relevante
- Entender o contexto
- Implementar uma solução
- Executar testes, se disponíveis

### Teste outros fluxos de trabalho comuns

Existem várias maneiras de trabalhar com o Claude:

**Refatorar código**

```
refatore o módulo de autenticação para usar async/await em vez de callbacks
```

**Escrever testes**

```
escreva testes unitários para as funções da calculadora
```

**Atualizar documentação**

```
atualize o README com instruções de instalação
```

**Revisão de código**

```
revise minhas alterações e sugira melhorias
```

> [!tip]
>
> **Lembre-se**: O Qwen Code é seu programador parceiro de IA. Fale com ele como faria com um colega prestativo – descreva o que deseja alcançar, e ele vai te ajudar a chegar lá.

## Comandos essenciais

Aqui estão os comandos mais importantes para o uso diário:

| Comando               | O que ele faz                                      | Exemplo                        |
| --------------------- | -------------------------------------------------- | ------------------------------ |
| `qwen`                | iniciar o Qwen Code                                | `qwen`                         |
| `/auth`               | Alterar método de autenticação                     | `/auth`                        |
| `/help`               | Exibir informações de ajuda para comandos disponíveis | `/help` ou `/?`              |
| `/compress`           | Substituir histórico do chat por resumo para economizar Tokens | `/compress`            |
| `/clear`              | Limpar conteúdo da tela do terminal                | `/clear` (atalho: `Ctrl+L`)    |
| `/theme`              | Alterar tema visual do Qwen Code                   | `/theme`                       |
| `/language`           | Visualizar ou alterar configurações de idioma      | `/language`                    |
| → `ui [idioma]`       | Definir idioma da interface do usuário             | `/language ui zh-CN`           |
| → `output [idioma]`   | Definir idioma de saída do LLM                     | `/language output Chinese`     |
| `/quit`               | Sair imediatamente do Qwen Code                    | `/quit` ou `/exit`             |

Veja a [referência da CLI](/users/reference/cli-reference) para uma lista completa de comandos.

## Dicas profissionais para iniciantes

**Seja específico com suas solicitações**

- Em vez de: "corrija o bug"
- Tente: "corrija o bug de login onde os usuários veem uma tela em branco após inserir credenciais erradas"

**Use instruções passo a passo**

- Divida tarefas complexas em etapas:

```
1. crie uma nova tabela de banco de dados para perfis de usuário
2. crie um endpoint de API para obter e atualizar perfis de usuário
3. construa uma página web que permita aos usuários visualizar e editar suas informações
```

**Deixe Claude explorar primeiro**

- Antes de fazer alterações, deixe Claude entender seu código:

```
analise o esquema do banco de dados
```

```
construa um painel mostrando produtos que são devolvidos com mais frequência por nossos clientes do Reino Unido
```

**Economize tempo com atalhos**

- Pressione `?` para ver todos os atalhos de teclado disponíveis
- Use Tab para completar comandos
- Pressione ↑ para histórico de comandos
- Digite `/` para ver todos os comandos com barra

## Obtendo ajuda

- **No Qwen Code**: Digite `/help` ou pergunte "como faço para..."
- **Documentação**: Você está aqui! Navegue por outros guias
- **Comunidade**: Junte-se à nossa [Discussão no GitHub](https://github.com/QwenLM/qwen-code/discussions) para dicas e suporte
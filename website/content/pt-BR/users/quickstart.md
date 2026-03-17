# Início Rápido

> 👏 Bem-vindo ao Qwen Code!

Este guia de início rápido permitirá que você comece a usar assistência de programação com IA em apenas alguns minutos. Ao final, você entenderá como utilizar o Qwen Code para tarefas comuns de desenvolvimento.

## Antes de começar

Certifique-se de ter:

- Um **terminal** ou prompt de comando aberto
- Um projeto de código para trabalhar
- Uma conta [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Etapa 1: Instalar o Qwen Code

Para instalar o Qwen Code, use um dos seguintes métodos:

### Instalação Rápida (Recomendada)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Execute o CMD como Administrador)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Recomenda-se reiniciar seu terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor.

### Instalação manual

**Pré-requisitos**

Certifique-se de ter o Node.js 20 ou posterior instalado. Faça o download em [nodejs.org](https://nodejs.org/pt-br/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Etapa 2: Faça login na sua conta

O Qwen Code exige uma conta para ser usado. Ao iniciar uma sessão interativa com o comando `qwen`, você precisará fazer login:

```bash

# Você será solicitado a fazer login na primeira utilização
qwen
```

# Siga os prompts para fazer login com sua conta  
`/auth`  
```

Selecione `Qwen OAuth`, faça login na sua conta e siga os prompts para confirmar. Após o login, suas credenciais são armazenadas e você não precisará fazer login novamente.

> [!note]  
>  
> Ao autenticar pela primeira vez o Qwen Code com sua conta Qwen, um workspace chamado `.qwen` é criado automaticamente para você. Esse workspace fornece acompanhamento centralizado de custos e gerenciamento de todo o uso do Qwen Code em sua organização.

> [!tip]  
>  
> Se você precisar fazer login novamente ou alternar entre contas, use o comando `/auth` dentro do Qwen Code.

## Etapa 3: Inicie sua primeira sessão  

Abra seu terminal em qualquer diretório de projeto e inicie o Qwen Code:  

```bash  
# opcional  
cd /caminho/para/seu/projeto  

# inicie o qwen  
qwen  
```  

Você verá a tela de boas-vindas do Qwen Code com as informações da sua sessão, conversas recentes e últimas atualizações. Digite `/help` para ver os comandos disponíveis.  

## Converse com o Qwen Code

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
> O Qwen Code lê seus arquivos conforme necessário — você não precisa adicionar manualmente contexto. O Qwen Code também tem acesso à própria documentação e pode responder perguntas sobre seus recursos e capacidades.

### Faça sua primeira alteração de código

Agora vamos fazer com que o Qwen Code realize uma tarefa real de programação. Experimente uma tarefa simples:

```
adicione uma função "hello world" ao arquivo principal
```

O Qwen Code fará o seguinte:

1. Localizará o arquivo apropriado  
2. Mostrará as alterações propostas  
3. Solicitará sua aprovação  
4. Realizará a edição  

> [!note]
>
> O Qwen Code sempre solicita permissão antes de modificar arquivos. Você pode aprovar alterações individualmente ou ativar o modo “Aceitar todas” para uma sessão.

### Usar o Git com o Qwen Code

O Qwen Code torna as operações do Git conversacionais:

```
quais arquivos eu modifiquei?
```

```
faça o commit das minhas alterações com uma mensagem descritiva
```

Você também pode solicitar operações mais complexas do Git:

```
crie um novo branch chamado feature/quickstart
```

```
mostre-me os últimos 5 commits
```

```
ajude-me a resolver conflitos de merge
```

### Corrigir um bug ou adicionar uma funcionalidade

O Qwen Code é proficiente em depuração e implementação de funcionalidades.

Descreva o que deseja em linguagem natural:

```
adicione validação de entrada ao formulário de registro de usuários
```

Ou corrija problemas existentes:

```
há um bug que permite que os usuários enviem formulários vazios — corrija-o
```

O Qwen Code irá:

- Localizar o código relevante
- Compreender o contexto
- Implementar uma solução
- Executar testes, se disponíveis

### Teste outros fluxos de trabalho comuns

Há diversas maneiras de trabalhar com o Qwen Code:

**Refatorar código**

```
refatore o módulo de autenticação para usar async/await em vez de callbacks
```

**Escrever testes**

```
escreva testes unitários para as funções da calculadora
```

**Atualizar a documentação**

```
atualize o README com instruções de instalação
```

**Revisão de código**

```
revise minhas alterações e sugira melhorias
```

> [!tip]
>
> **Lembre-se**: o Qwen Code é seu programador par inteligente. Converse com ele como faria com um colega útil — descreva o que deseja alcançar, e ele o ajudará a chegar lá.

## Comandos essenciais

Aqui estão os comandos mais importantes para uso diário:

| Comando               | O que faz                                        | Exemplo                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | inicia o Qwen Code                               | `qwen`                        |
| `/auth`               | altera o método de autenticação                  | `/auth`                       |
| `/help`               | exibe informações de ajuda para os comandos disponíveis | `/help` ou `/?`               |
| `/compress`           | substitui o histórico da conversa por um resumo para economizar Tokens | `/compress`                   |
| `/clear`              | limpa o conteúdo da tela do terminal             | `/clear` (atalho: `Ctrl+L`)   |
| `/theme`              | altera o tema visual do Qwen Code                | `/theme`                      |
| `/language`           | visualiza ou altera as configurações de idioma   | `/language`                   |
| → `ui [idioma]`       | define o idioma da interface do usuário          | `/language ui pt-BR`          |
| → `output [idioma]`   | define o idioma da saída do LLM                  | `/language output Português`  |
| `/quit`               | sai do Qwen Code imediatamente                   | `/quit` ou `/exit`            |

Consulte a [referência da CLI](./features/commands) para obter uma lista completa de comandos.

## Dicas profissionais para iniciantes

**Seja específico com suas solicitações**

- Em vez de: “corrija o bug”
- Tente: “corrija o bug de login em que os usuários veem uma tela em branco após inserirem credenciais incorretas”

**Use instruções passo a passo**

- Divida tarefas complexas em etapas:

```
1. crie uma nova tabela no banco de dados para perfis de usuários
2. crie um endpoint de API para obter e atualizar perfis de usuários
3. construa uma página web que permita aos usuários visualizar e editar suas informações
```

**Permita que o Qwen Code explore primeiro**

- Antes de fazer alterações, deixe o Qwen Code entender seu código:

```
analise o esquema do banco de dados
```

```
construa um painel mostrando os produtos mais frequentemente devolvidos por nossos clientes do Reino Unido
```

**Economize tempo com atalhos**

- Pressione `?` para ver todos os atalhos de teclado disponíveis
- Use Tab para conclusão automática de comandos
- Pressione ↑ para acessar o histórico de comandos
- Digite `/` para ver todos os comandos com barra

## Obtendo ajuda

- **No Qwen Code**: Digite `/help` ou pergunte “como faço para…”
- **Documentação**: Você está aqui! Navegue por outros guias.
- **Comunidade**: Participe de nossas [Discussões no GitHub](https://github.com/QwenLM/qwen-code/discussions) para obter dicas e suporte.
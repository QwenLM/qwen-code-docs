# Início Rápido

> 👏 Bem-vindo ao Qwen Code!

Este guia de início rápido fará você usar assistência de codificação com IA em apenas alguns minutos. Ao final, você entenderá como usar o Qwen Code para tarefas comuns de desenvolvimento.

## Antes de começar

Certifique-se de ter:

- Um **terminal** ou prompt de comando aberto
- Um projeto de código para trabalhar
- Uma chave de API do Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)), ou uma assinatura do Plano de Codificação da Alibaba Cloud ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))

## Passo 1: Instalar o Qwen Code

Para instalar o Qwen Code, use um dos seguintes métodos:

### Instalação Rápida (Recomendado)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> Recomenda-se reiniciar o terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor.

### Instalação Manual

**Pré-requisitos**

Certifique-se de ter o Node.js 22 ou superior instalado. Baixe-o em [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Passo 2: Configurar autenticação

Ao iniciar uma sessão interativa com o comando `qwen`, você será solicitado a configurar a autenticação:

```bash
# Você será solicitado a configurar a autenticação no primeiro uso
qwen
```

```bash
# Ou execute /auth a qualquer momento para alterar o método de autenticação
/auth
```

O menu da primeira execução permite conectar um provedor de modelo. Escolha um dos:

- **Alibaba ModelStudio** — a configuração recomendada. Abre um submenu:
  - **Plano de Codificação**: para desenvolvedores individuais, com uma cota semanal inclusa e diversas opções de modelo. Consulte o [guia do Plano de Codificação](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) para instruções de configuração.
  - **Plano de Token**: faturamento baseado em uso com um endpoint dedicado, voltado para equipes e empresas.
  - **Chave de API Padrão**: conecte-se com uma chave de API existente do Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Veja o guia de configuração de API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) para detalhes.
- **Provedores Terceiros** — escolha um provedor integrado (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty e outros) e conecte-se com uma chave de API.
- **Provedor Personalizado** — conecte manualmente um servidor local, proxy ou provedor não suportado.

> ⚠️ **Nota**: O Qwen OAuth foi descontinuado em 15 de abril de 2026. Se você estava usando o Qwen OAuth anteriormente, mude para um dos métodos acima.

> [!note]
>
> Quando você autentica o Qwen Code pela primeira vez com sua conta Qwen, um espaço de trabalho chamado ".qwen" é criado automaticamente para você. Este espaço de trabalho fornece rastreamento e gerenciamento de custos centralizados para todo o uso do Qwen Code em sua organização.

> [!tip]
>
> Para configurar a autenticação, inicie o Qwen Code e execute `/auth`. Use `/doctor` para verificar sua configuração atual a qualquer momento. Veja a página [Autenticação](./configuration/auth) para detalhes.

## Passo 3: Iniciar sua primeira sessão

Abra seu terminal em qualquer diretório de projeto e inicie o Qwen Code:

```bash
# opcional
cd /caminho/para/seu/projeto
# inicia qwen
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
> O Qwen Code lê seus arquivos conforme necessário — você não precisa adicionar contexto manualmente. O Qwen Code também tem acesso à sua própria documentação e pode responder perguntas sobre seus recursos e capacidades.

### Faça sua primeira alteração de código

Agora vamos fazer o Qwen Code realizar alguma codificação de verdade. Tente uma tarefa simples:

```
adicione uma função hello world ao arquivo principal
```

O Qwen Code irá:

1. Encontrar o arquivo apropriado
2. Mostrar a você as alterações propostas
3. Pedir sua aprovação
4. Fazer a edição

> [!note]
>
> O Qwen Code sempre pede permissão antes de modificar arquivos. Você pode aprovar alterações individuais ou ativar o modo "Aceitar todas" para uma sessão.

### Use Git com o Qwen Code

O Qwen Code torna as operações Git conversacionais:

```
quais arquivos eu modifiquei?
```
```
faça um commit das minhas alterações com uma mensagem descritiva
```

Você também pode solicitar operações Git mais complexas:

```
crie uma nova branch chamada feature/quickstart
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
adicione validação de entrada ao formulário de registro de usuário
```

Ou corrija problemas existentes:

```
há um bug onde os usuários podem enviar formulários vazios - corrija isso
```

O Qwen Code irá:

- Localizar o código relevante
- Entender o contexto
- Implementar uma solução
- Executar testes se disponíveis

### Teste outros fluxos de trabalho comuns

Existem várias maneiras de trabalhar com o Qwen Code:

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
> **Lembre-se**: O Qwen Code é seu programador parceiro de IA. Fale com ele como faria com um colega prestativo - descreva o que deseja alcançar, e ele o ajudará a chegar lá.

## Comandos essenciais

Aqui estão os comandos mais importantes para uso diário:

| Comando              | O que faz                                        | Exemplo                       |
| -------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`               | iniciar o Qwen Code                              | `qwen`                        |
| `/auth`              | Alterar método de autenticação (na sessão)       | `/auth`                       |
| `/doctor`            | Verificar autenticação e ambiente atuais         | `/doctor`                     |
| `/help`              | Exibir informações de ajuda para comandos disponíveis | `/help` ou `/?`               |
| `/compress`          | Substituir histórico do chat por resumo para economizar Tokens | `/compress`                   |
| `/clear`             | Limpar o conteúdo da tela do terminal            | `/clear` (atalho: `Ctrl+L`)   |
| `/theme`             | Alterar o tema visual do Qwen Code               | `/theme`                      |
| `/language`          | Visualizar ou alterar configurações de idioma    | `/language`                   |
| → `ui [idioma]`      | Definir idioma da interface                      | `/language ui pt-BR`          |
| → `output [idioma]`  | Definir idioma de saída do LLM                   | `/language output Português`  |
| `/quit`              | Sair do Qwen Code imediatamente                  | `/quit` ou `/exit`            |

Consulte a [referência CLI](./features/commands) para uma lista completa de comandos.

## Dicas profissionais para iniciantes

**Seja específico em suas solicitações**

- Em vez de: "corrigir o bug"
- Tente: "corrigir o bug de login onde os usuários veem uma tela em branco após inserir credenciais erradas"

**Use instruções passo a passo**

- Divida tarefas complexas em etapas:

```
1. crie uma nova tabela de banco de dados para perfis de usuário
2. crie um endpoint de API para obter e atualizar perfis de usuário
3. construa uma página web que permita aos usuários ver e editar suas informações
```

**Deixe o Qwen Code explorar primeiro**

- Antes de fazer alterações, deixe o Qwen Code entender seu código:

```
analise o esquema do banco de dados
```

```
construa um dashboard mostrando produtos que são mais frequentemente devolvidos por nossos clientes do Reino Unido
```

**Economize tempo com atalhos**

- Pressione `?` para ver todos os atalhos de teclado disponíveis
- Use Tab para completar comandos
- Pressione ↑ para o histórico de comandos
- Digite `/` para ver todos os comandos de barra

## Obtendo ajuda

- **No Qwen Code**: Digite `/help` ou pergunte "como faço para..."
- **Documentação**: Você está aqui! Navegue por outros guias
- **Comunidade**: Junte-se à nossa [Discussão no GitHub](https://github.com/QwenLM/qwen-code/discussions) para dicas e suporte

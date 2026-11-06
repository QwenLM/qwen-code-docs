# Guia de início rápido

> 👏 Bem-vindo ao Qwen Code!

Este guia de início rápido fará você usar assistência de codificação com IA em apenas alguns minutos. Ao final, você entenderá como usar o Qwen Code para tarefas comuns de desenvolvimento.

## **Antes de começar**

Certifique-se de ter:

- Um terminal ou prompt de comando aberto
- Um projeto de código para trabalhar
- **Uma das seguintes opções**:
  - Uma conta Qwen com uma **assinatura Plus ou Pro** do [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code), que desbloqueia o acesso ao **Qwen Code e Agent**
  - Uma chave de API ou assinatura Token Plan da plataforma Qianwen AI / **QwenCloud** ([China](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) / [Internacional](https://docs.qwencloud.com/developer-guides/administration/api-keys)) — a configuração recomendada
  - Uma chave de API do **Alibaba Cloud ModelStudio** ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/))
  - Uma assinatura do **Alibaba Cloud Token Plan** ([Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model))

## Passo 1: Instalar o Qwen Code

Para instalar o Qwen Code, use um dos seguintes métodos:

### Instalação rápida (Recomendado)

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
> É recomendado reiniciar o terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor.

### Instalação manual

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

Quando você iniciar uma sessão interativa com o comando `qwen`, será solicitado a configurar a autenticação:

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

O menu de primeira execução permite conectar um provedor de modelo. Escolha uma das opções:

- [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code) — faça login com sua conta Qwen para acessar o **Qwen Code e Agent** com sua **assinatura Plus ou Pro**. Se você ainda não tem uma assinatura, visite [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code) para assinar o Plus ou Pro, depois retorne ao Qwen Code e selecione [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code).
- **QwenCloud** — a configuração recomendada. Abre um sub-menu:
  - **Token Plan**: assinatura com cota mensal de Créditos em um endpoint dedicado (edições Pessoal e Equipe).
  - **Chave de API Padrão**: pagamento por uso, conecte-se com uma chave de API existente da plataforma.

  Em ambos os casos, você escolhe explicitamente a plataforma (China ou Internacional), então o idioma da interface nunca decide seu endpoint. Veja [Autenticação → Opção 2: QwenCloud](./configuration/auth) para detalhes.

- **Alibaba ModelStudio** — abre um sub-menu:
  - **Coding Plan**: conecte-se com uma chave de API do Alibaba Cloud Coding Plan. Veja [Autenticação](./configuration/auth.md#-option-3-alibaba-cloud-coding-plan) para configuração.
  - **Token Plan**: faturamento baseado em uso com um endpoint dedicado, voltado para equipes e empresas. Veja o [guia do Token Plan](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) para instruções de configuração.
  - **Standard API Key**: conecte-se com uma chave de API existente do Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Veja o guia de configuração de API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) para detalhes.
- **Provedores de terceiros** — escolha um provedor embutido (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty e outros) e conecte-se com uma chave de API.
- **Provedor personalizado** — conecte manualmente um servidor local, proxy ou provedor não suportado.

> [!note]
>
> O Qwen Code armazena sua configuração e personalizações em diretórios `.qwen`: `~/.qwen/` para configurações de usuário (por exemplo, `settings.json`) e comandos personalizados globais, e `<project>/.qwen/` para arquivos específicos do projeto, como comandos personalizados e resumos.

> [!tip]
>
> Para configurar a autenticação, inicie o Qwen Code e execute `/auth`. Use `/doctor` para verificar sua configuração atual a qualquer momento. Veja a página [Autenticação](./configuration/auth) para detalhes.

## Etapa 3: Inicie sua primeira sessão

Abra seu terminal em qualquer diretório de projeto e inicie o Qwen Code:

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Você verá a tela de boas-vindas do Qwen Code com informações da sessão, conversas recentes e últimas atualizações. Digite `/help` para comandos disponíveis.

## Converse com o Qwen Code

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
> O Qwen Code lê seus arquivos conforme necessário - você não precisa adicionar contexto manualmente. O Qwen Code também tem acesso à sua própria documentação e pode responder perguntas sobre seus recursos e capacidades.

### Faça sua primeira alteração de código

Agora vamos fazer o Qwen Code realizar alguma codificação real. Tente uma tarefa simples:

```
add a hello world function to the main file
```

O Qwen Code irá:

1. Encontrar o arquivo apropriado
2. Mostrar as alterações propostas
3. Pedir sua aprovação
4. Fazer a edição

> [!note]
>
> O Qwen Code sempre pede permissão antes de modificar arquivos. Você pode aprovar alterações individuais ou ativar o modo "Aceitar tudo" para uma sessão.

### Use Git com o Qwen Code

O Qwen Code torna as operações Git conversacionais:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Você também pode solicitar operações Git mais complexas:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Corrija um bug ou adicione um recurso

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
- Entender o contexto
- Implementar uma solução
- Executar testes se disponíveis

### Teste outros fluxos de trabalho comuns

Há várias maneiras de trabalhar com o Qwen Code:

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
> **Lembre-se**: O Qwen Code é seu programador parceiro de IA. Fale com ele como faria com um colega prestativo - descreva o que deseja alcançar e ele ajudará você a chegar lá.

## Comandos essenciais

Aqui estão os comandos mais importantes para uso diário:

| Comando               | O que faz                                        | Exemplo                            |
| --------------------- | ------------------------------------------------ | ---------------------------------- |
| `qwen`              | iniciar o Qwen Code                                 | `qwen`                        |
| `/auth`             | Alterar método de autenticação (na sessão)           | `/auth`                       |
| `/doctor`           | Verificar autenticação e ambiente atuais            | `/doctor`                     |
| `/help`             | Exibir ajuda para comandos disponíveis              | `/help` ou `/?`               |
| `/compress`         | Substituir histórico de chat por resumo para economizar Tokens | `/compress`                   |
| `/clear`            | Limpar histórico de conversas e liberar contexto    | `/clear` (aliases: `reset`, `new`) |
| `/theme`            | Alterar tema visual do Qwen Code                     | `/theme`                      |
| `/language`         | Visualizar ou alterar configurações de idioma        | `/language`                   |
| → `ui [language]`     | Define o idioma da interface do usuário          | `/language ui zh-CN`               |
| → `output [language]` | Define o idioma de saída do LLM                  | `/language output Chinese`         |
| `/quit`             | Sair do Qwen Code imediatamente                     | `/quit` ou `/exit`            |

Veja a [referência da CLI](./features/commands) para uma lista completa de comandos.

## Dicas profissionais para iniciantes

**Seja específico em suas solicitações**

- Em vez de: "corrija o bug"
- Tente: "corrija o bug de login onde os usuários veem uma tela em branco após inserir credenciais incorretas"

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
- Use Tab para completar comandos
- Pressione ↑ para histórico de comandos
- Digite `/` para ver todos os comandos slash

## Obtendo ajuda

- **No Qwen Code**: Digite `/help` ou pergunte "como faço para..."
- **Documentação**: Você está aqui! Navegue por outros guias
- **Comunidade**: Junte-se à nossa [Discussão no GitHub](https://github.com/QwenLM/qwen-code/discussions) para dicas e suporte

# Visão geral do Qwen Code

> Conheça o Qwen Code, a ferramenta de codificação agente da Qwen que reside em seu terminal e ajuda você a transformar ideias em código mais rápido do que nunca.

## Comece em 30 segundos

Pré-requisitos:

- Uma conta no [Qwen Code](https://chat.qwen.ai/auth?mode=register)
- Requer [Node.js 20+](https://nodejs.org/zh-cn/download), você pode usar `node -v` para verificar a versão. Se não estiver instalado, utilize o seguinte comando para instalá-lo.

### Instale o Qwen Code:

**NPM**(recomendado)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew**(macOS, Linux)

```bash
brew install qwen-code
```

### Comece a usar o Qwen Code:

```bash
cd seu-projeto
qwen
```

Selecione a autenticação **Qwen OAuth (Gratuito)** e siga as instruções para fazer login. Em seguida, vamos começar entendendo sua base de código. Tente um destes comandos:

```
o que este projeto faz?
```

![](https://gw.alicdn.com/imgextra/i2/O1CN01XoPbZm1CrsZzvMQ6m_!!6000000000135-1-tps-772-646.gif)

Você será solicitado a fazer login na primeira utilização. É isso! [Continue com o Quickstart (5 minutos) →](../users/quickstart)

> [!tip]
>
> Veja [solução de problemas](../users/support/troubleshooting) caso encontre dificuldades.

> [!note]
>
> **Nova Extensão do VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão do VS Code** oferece uma experiência IDE nativa e fácil de usar, sem necessidade de familiaridade com o terminal. Basta instalar pela marketplace e começar a codar com o Qwen Code diretamente na barra lateral. Você pode procurar por **Qwen Code** no Marketplace do VS Code e baixá-lo.

## O que o Qwen Code faz por você

- **Constrói funcionalidades a partir de descrições**: Diga ao Qwen Code o que você deseja construir em linguagem simples. Ele fará um plano, escreverá o código e garantirá que ele funcione.
- **Depura e corrige problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará sua base de código, identificará o problema e implementará uma correção.
- **Navega por qualquer base de código**: Pergunte qualquer coisa sobre a base de código da sua equipe e receba uma resposta bem elaborada. O Qwen Code mantém conhecimento sobre toda a estrutura do seu projeto, pode encontrar informações atualizadas na web e, com o [MCP](../users/features/mcp), pode obter dados de fontes externas como Google Drive, Figma e Slack.
- **Automatiza tarefas tediosas**: Corrija problemas chatos de lint, resolva conflitos de merge e escreva notas de release. Faça tudo isso com um único comando nas suas máquinas de desenvolvimento ou automaticamente no CI.

## Por que desenvolvedores amam o Qwen Code

- **Funciona no seu terminal**: Não é mais uma janela de chat. Nem mais uma IDE. O Qwen Code está onde você já trabalha, com as ferramentas que você já ama.
- **Age diretamente**: O Qwen Code pode editar arquivos, executar comandos e criar commits. Precisa de mais? [MCP](../users/features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus tickets no Jira ou utilize _suas_ ferramentas personalizadas de desenvolvimento.
- **Filosofia Unix**: O Qwen Code é composto e passível de scripts. `tail -f app.log | qwen -p "Me avise no Slack se aparecer alguma anomalia nesse fluxo de logs"` _funciona_. Seu CI pode rodar `qwen -p "Se houver novas strings de texto, traduza-as para o francês e crie um PR para revisão da equipe @lang-fr-team"`.
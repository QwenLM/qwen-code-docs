# Visão geral do Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Saiba mais sobre o Qwen Code, a ferramenta de codificação agente da Qwen que reside em seu terminal e ajuda você a transformar ideias em código mais rapidamente do que nunca.

## Comece em 30 segundos

Pré-requisitos:

- Uma conta [Qwen Code](https://chat.qwen.ai/auth?mode=register)
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

Selecione a autenticação **Qwen OAuth (Grátis)** e siga as instruções para fazer login. Em seguida, vamos começar entendendo sua base de código. Experimente um destes comandos:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Você será solicitado a fazer login na primeira utilização. É isso! [Continue com o Início Rápido (5 min) →](./quickstart)

> [!tip]
>
> Consulte [solução de problemas](./support/troubleshooting) se encontrar problemas.

> [!note]
>
> **Nova Extensão para VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão para VS Code** oferece uma experiência nativa e fácil de usar sem exigir familiaridade com o terminal. Basta instalar a partir do marketplace e começar a codificar com o Qwen Code diretamente em sua barra lateral. Baixe e instale agora o [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## O que o Qwen Code faz por você

- **Construa recursos a partir de descrições**: Diga ao Qwen Code o que você deseja construir em linguagem simples. Ele fará um plano, escreverá o código e garantirá que funcione.
- **Depure e corrija problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará sua base de código, identificará o problema e implementará uma correção.
- **Navegue por qualquer base de código**: Pergunte qualquer coisa sobre a base de código da sua equipe e obtenha uma resposta completa. O Qwen Code mantém consciência da estrutura completa do seu projeto, pode encontrar informações atualizadas na web e, com o [MCP](./features/mcp), pode extrair dados de fontes externas como Google Drive, Figma e Slack.
- **Automatize tarefas tediosas**: Corrija problemas de lint irritantes, resolva conflitos de merge e escreva notas de versão. Faça tudo isso com um único comando em suas máquinas de desenvolvimento ou automaticamente no CI.

## Por que desenvolvedores adoram o Qwen Code

- **Funciona no seu terminal**: Não é outra janela de chat. Não é outro IDE. O Qwen Code encontra você onde você já trabalha, com as ferramentas que você já ama.
- **Age diretamente**: O Qwen Code pode editar arquivos diretamente, executar comandos e criar commits. Precisa de mais? O [MCP](./features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus tickets no Jira ou utilize suas _próprias_ ferramentas personalizadas de desenvolvimento.
- **Filosofia Unix**: O Qwen Code é composto e programável. `tail -f app.log | qwen -p "Me avise no Slack se vir alguma anomalia aparecer neste fluxo de log"` _funciona_. Seu CI pode executar `qwen -p "Se houver novas strings de texto, traduza-as para o francês e crie um PR para @equipe-franca revisar"`.
# Visão geral do Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Saiba mais sobre o Qwen Code, a ferramenta de programação agente da Qwen que roda diretamente no seu terminal e ajuda você a transformar ideias em código mais rapidamente do que nunca.

## Comece em 30 segundos

### Instalar o Qwen Code:

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Executar no CMD como Administrador)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Recomenda-se reiniciar seu terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor. Se a instalação falhar, consulte a seção [Instalação Manual](./quickstart#manual-installation) no guia de início rápido.

### Comece a usar o Qwen Code:

```bash
cd seu-projeto
qwen
```

Selecione a autenticação **Qwen OAuth (Grátis)** e siga as instruções para fazer login. Em seguida, vamos começar entendendo sua base de código. Experimente um desses comandos:

```
o que este projeto faz?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Você será solicitado a fazer login na primeira utilização. É só isso! [Continue com o Guia Rápido (5 minutos) →](./quickstart)

> [!tip]
>
> Consulte a seção de [solução de problemas](./support/troubleshooting) caso encontre dificuldades.

> [!note]
>
> **Nova Extensão para VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão para VS Code** oferece uma experiência nativa e intuitiva no IDE, sem exigir familiaridade com o terminal. Basta instalá-la na marketplace e começar a programar com o Qwen Code diretamente na sua barra lateral. Baixe e instale agora mesmo o [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## O que o Qwen Code faz por você

- **Criar funcionalidades a partir de descrições**: Diga ao Qwen Code o que você deseja criar, em linguagem natural. Ele elaborará um plano, escreverá o código e garantirá que ele funcione.
- **Depurar e corrigir problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará sua base de código, identificará o problema e implementará uma correção.
- **Navegar qualquer base de código**: Faça qualquer pergunta sobre a base de código da sua equipe e receba uma resposta bem fundamentada. O Qwen Code mantém conhecimento da estrutura completa do seu projeto, pode buscar informações atualizadas na web e, com o [MCP](./features/mcp), pode extrair dados de fontes externas como Google Drive, Figma e Slack.
- **Automatizar tarefas repetitivas**: Corrija problemas de linting, resolva conflitos de merge e escreva notas de versão. Faça tudo isso com um único comando em suas máquinas de desenvolvedor ou automaticamente em CI.

## Por que os desenvolvedores adoram o Qwen Code

- **Funciona no seu terminal**: Não é outra janela de chat. Não é outro IDE. O Qwen Code encontra você exatamente onde você já trabalha, com as ferramentas que você já ama.
- **Toma ações concretas**: O Qwen Code pode editar arquivos diretamente, executar comandos e criar *commits*. Quer mais? O [MCP](./features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus chamados no Jira ou use _suas_ ferramentas personalizadas de desenvolvedor.
- **Filosofia Unix**: O Qwen Code é composto por partes reutilizáveis e pode ser automatizado por scripts. `tail -f app.log | qwen -p "Me avise no Slack se você detectar alguma anomalia nesse fluxo de logs"` _funciona_. Seu CI pode executar `qwen -p "Se houver novas strings de texto, traduza-as para o francês e crie um *pull request* para revisão da equipe @lang-fr-team"`.
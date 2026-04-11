# Visão geral do Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Conheça o Qwen Code, a ferramenta de codificação com agentes da Qwen que roda no seu terminal e ajuda você a transformar ideias em código mais rápido do que nunca.

## Comece a usar em 30 segundos

### Instale o Qwen Code:

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
> É recomendável reiniciar o terminal após a instalação para garantir que as variáveis de ambiente entrem em vigor. Se a instalação falhar, consulte [Instalação manual](./quickstart#manual-installation) no guia de início rápido.

### Comece a usar o Qwen Code:

```bash
cd your-project
qwen
```

Selecione a autenticação **Qwen OAuth (Free)** e siga as instruções para fazer login. Em seguida, vamos começar entendendo sua base de código. Experimente um destes comandos:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Você será solicitado a fazer login no primeiro uso. É só isso! [Continue com o Início rápido (5 min) →](./quickstart)

> [!tip]
>
> Consulte [solução de problemas](./support/troubleshooting) se encontrar algum problema.

> [!note]
>
> **Nova extensão para VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão para VS Code** oferece uma experiência de IDE nativa e fácil de usar, sem exigir familiaridade com o terminal. Basta instalar pelo marketplace e começar a codificar com o Qwen Code diretamente na sua barra lateral. Baixe e instale o [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) agora.

## O que o Qwen Code faz por você

- **Crie funcionalidades a partir de descrições**: Diga ao Qwen Code o que você quer construir em linguagem natural. Ele criará um plano, escreverá o código e garantirá que funcione.
- **Depure e corrija problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará sua base de código, identificará o problema e implementará uma correção.
- **Navegue por qualquer base de código**: Faça qualquer pergunta sobre a base de código da sua equipe e receba uma resposta detalhada. O Qwen Code mantém o conhecimento de toda a estrutura do seu projeto, pode buscar informações atualizadas na web e, com o [MCP](./features/mcp), pode extrair dados de fontes externas como Google Drive, Figma e Slack.
- **Automatize tarefas tediosas**: Corrija problemas de lint complicados, resolva conflitos de merge e escreva notas de lançamento. Faça tudo isso com um único comando nas suas máquinas de desenvolvimento ou automaticamente no CI.
- **[Sugestões de acompanhamento](./features/followup-suggestions)**: O Qwen Code prevê o que você quer digitar a seguir e exibe como texto fantasma. Pressione Tab para aceitar ou continue digitando para descartar.

## Por que os desenvolvedores adoram o Qwen Code

- **Funciona no seu terminal**: Não é mais uma janela de chat. Não é outra IDE. O Qwen Code encontra você onde já trabalha, com as ferramentas que você já gosta.
- **Toma ação**: O Qwen Code pode editar arquivos diretamente, executar comandos e criar commits. Precisa de mais? O [MCP](./features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus tickets no Jira ou use _suas_ ferramentas de desenvolvimento personalizadas.
- **Filosofia Unix**: O Qwen Code é composável e scriptável. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funciona_. Seu CI pode executar `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.
# Visão geral do Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Saiba mais sobre o Qwen Code, a ferramenta de codificação agente do Qwen que vive no seu terminal e ajuda você a transformar ideias em código mais rápido do que nunca.

## Comece em 30 segundos

### Instalar o Qwen Code:

O instalador recomendado utiliza um arquivo autônomo quando disponível para sua plataforma. Se ele recorrer ao npm, o Node.js 22 ou posterior com npm deve estar disponível no PATH.

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
> Recomenda-se reiniciar o terminal após a instalação se o comando `qwen` não estiver imediatamente disponível no PATH. Se a instalação falhar, consulte [Instalação Manual](./quickstart#manual-installation) no guia de início rápido. Para instalação offline, baixe um arquivo de lançamento e execute o instalador com `--archive PATH`; mantenha `SHA256SUMS` ao lado do arquivo.

### Comece a usar o Qwen Code:

```bash
cd your-project
qwen
```

No primeiro lançamento, você será solicitado a conectar um provedor de modelo. O menu oferece **Alibaba ModelStudio** (Coding Plan, Token Plan ou Standard API Key), **Provedores Terceiros** (provedores integrados como DeepSeek, MiniMax, Z.AI e OpenRouter, conectados com uma chave de API) e **Provedor Personalizado** (um servidor local, proxy ou provedor não suportado). Para o [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)), escolha **Alibaba ModelStudio → Coding Plan**; para usar uma chave de API do ModelStudio, escolha **Alibaba ModelStudio → Standard API Key** e siga o guia de configuração de API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Então vamos começar entendendo seu codebase. Experimente um destes comandos:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Você será solicitado a fazer login no primeiro uso. É isso! [Continue com o Início Rápido (5 min) →](./quickstart)

> [!tip]
>
> Consulte [solução de problemas](./support/troubleshooting) se encontrar problemas.

> [!note]
>
> **Nova Extensão VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão VS Code** oferece uma experiência nativa de IDE fácil de usar, sem necessidade de familiaridade com o terminal. Basta instalar do marketplace e começar a codificar com o Qwen Code diretamente em sua barra lateral. Baixe e instale o [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) agora.

## O que o Qwen Code faz por você

- **Criar funcionalidades a partir de descrições**: Diga ao Qwen Code o que você quer construir em linguagem natural. Ele fará um plano, escreverá o código e garantirá que funcione.
- **Depurar e corrigir problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará seu codebase, identificará o problema e implementará uma correção.
- **Navegar em qualquer codebase**: Pergunte qualquer coisa sobre o codebase da sua equipe e receba uma resposta bem pensada. O Qwen Code mantém consciência de toda a estrutura do seu projeto, pode encontrar informações atualizadas da web e, com [MCP](./features/mcp), pode acessar fontes de dados externas como Google Drive, Figma e Slack.
- **Automatizar tarefas tediosas**: Corrigir problemas chatos de lint, resolver conflitos de merge e escrever notas de lançamento. Faça tudo isso em um único comando a partir de suas máquinas de desenvolvimento ou automaticamente em CI.
- **[Sugestões de acompanhamento](./features/followup-suggestions)**: O Qwen Code prevê o que você deseja digitar em seguida e mostra como texto fantasma. Pressione Tab para aceitar ou continue digitando para dispensar.

## Por que os desenvolvedores amam o Qwen Code

- **Funciona no seu terminal**: Não é outra janela de chat. Nem outra IDE. O Qwen Code encontra você onde você já trabalha, com as ferramentas que você já ama.
- **Toma ação**: O Qwen Code pode editar arquivos diretamente, executar comandos e criar commits. Precisa de mais? [MCP](./features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus tickets no Jira ou use _suas_ ferramentas de desenvolvimento personalizadas.
- **Filosofia Unix**: O Qwen Code é composível e scriptável. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funciona_. Seu CI pode executar `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.

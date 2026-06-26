# Visão geral do Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Conheça o Qwen Code, a ferramenta de codificação agêntica do Qwen que vive no seu terminal e ajuda você a transformar ideias em código mais rápido do que nunca.

## Primeiros passos em 30 segundos

### Instalar o Qwen Code:

O instalador recomendado usa um arquivo standalone quando disponível para sua plataforma. Se ele recorrer ao npm, o Node.js 22 ou superior com npm deve estar disponível no PATH.

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
> É recomendado reiniciar o terminal após a instalação se `qwen` não estiver imediatamente disponível no PATH. Se a instalação falhar, consulte [Instalação Manual](./quickstart#manual-installation) no guia de início rápido. Para instalação offline, baixe um arquivo de release e execute o instalador com `--archive PATH`; mantenha `SHA256SUMS` ao lado do arquivo.

### Começar a usar o Qwen Code:

```bash
cd your-project
qwen
```

No primeiro uso, você será solicitado a conectar um provedor de modelo. O menu oferece **Alibaba ModelStudio** (Coding Plan, Token Plan ou Standard API Key), **Provedores Terceiros** (provedores integrados como DeepSeek, MiniMax, Z.AI e OpenRouter, conectados com uma chave de API), e **Provedor Personalizado** (um servidor local, proxy ou provedor não suportado). Para o [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)), escolha **Alibaba ModelStudio → Coding Plan**; para usar uma chave de API do ModelStudio, escolha **Alibaba ModelStudio → Standard API Key** e siga o guia de configuração da API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Em seguida, vamos começar entendendo sua base de código. Tente um destes comandos:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Você será solicitado a fazer login no primeiro uso. É isso! [Continue com o Guia de Início Rápido (5 min) →](./quickstart)

> [!tip]
>
> Consulte [solução de problemas](./support/troubleshooting) se encontrar problemas.

> [!note]
>
> **Nova Extensão VS Code (Beta)**: Prefere uma interface gráfica? Nossa nova **extensão VS Code** oferece uma experiência de IDE nativa fácil de usar, sem exigir familiaridade com o terminal. Basta instalar do marketplace e começar a codificar com o Qwen Code diretamente na sua barra lateral. Baixe e instale o [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) agora.

## O que o Qwen Code faz por você

- **Construir funcionalidades a partir de descrições**: Diga ao Qwen Code o que você deseja construir em linguagem natural. Ele fará um plano, escreverá o código e garantirá que funcione.
- **Depurar e corrigir problemas**: Descreva um bug ou cole uma mensagem de erro. O Qwen Code analisará sua base de código, identificará o problema e implementará uma correção.
- **Navegar em qualquer base de código**: Pergunte qualquer coisa sobre a base de código da sua equipe e receba uma resposta bem pensada. O Qwen Code mantém conhecimento de toda a estrutura do seu projeto, pode encontrar informações atualizadas na web e, com [MCP](./features/mcp), pode obter dados de fontes externas como Google Drive, Figma e Slack.
- **Automatizar tarefas tediosas**: Corrigir problemas de lint complexos, resolver conflitos de merge e escrever notas de release. Faça tudo isso em um único comando a partir de suas máquinas de desenvolvimento, ou automaticamente em CI.
- **[Sugestões de acompanhamento](./features/followup-suggestions)**: O Qwen Code prevê o que você deseja digitar em seguida e exibe como texto fantasma. Pressione Tab para aceitar, ou continue digitando para descartar.

## Por que os desenvolvedores amam o Qwen Code

- **Funciona no seu terminal**: Não é outra janela de chat. Não é outro IDE. O Qwen Code encontra você onde você já trabalha, com as ferramentas que você já ama.
- **Toma ação**: O Qwen Code pode editar arquivos diretamente, executar comandos e criar commits. Precisa de mais? [MCP](./features/mcp) permite que o Qwen Code leia seus documentos de design no Google Drive, atualize seus tickets no Jira ou use _suas_ ferramentas de desenvolvedor personalizadas.
- **Filosofia Unix**: O Qwen Code é composto e scriptável. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funciona_. Seu CI pode executar `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.
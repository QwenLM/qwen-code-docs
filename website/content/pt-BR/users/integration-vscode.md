# Visual Studio Code

> A extensão do VS Code (Beta) permite que você veja as alterações do Qwen em tempo real por meio de uma interface gráfica nativa integrada diretamente ao seu IDE, facilitando o acesso e a interação com o Qwen Code.

<br/>

<video src="https://cloud.video.taobao.com/vod/JnvYMhUia2EKFAaiuErqNpzWE9mz3odG76vArAHNg94.mp4" controls width="800">
  Seu navegador não suporta a tag de vídeo.
</video>

### Recursos

- **Experiência nativa do IDE**: Painel lateral dedicado do Qwen Code acessado pelo ícone do Qwen
- **Modo de aceitação automática de edições**: Aplica automaticamente as alterações feitas pelo Qwen conforme elas são realizadas
- **Gerenciamento de arquivos**: Marcar arquivos com @ ou anexar arquivos e imagens usando o seletor de arquivos do sistema
- **Histórico de conversas**: Acesso às conversas anteriores
- **Múltiplas sessões**: Executar várias sessões do Qwen Code simultaneamente

### Requisitos

- VS Code 1.98.0 ou superior

### Instalação

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Baixe e instale a extensão no [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Solução de Problemas

### Extensão não está sendo instalada

- Certifique-se de ter o VS Code 1.98.0 ou superior
- Verifique se o VS Code tem permissão para instalar extensões
- Tente instalar diretamente do site do Marketplace

### Qwen Code não responde

- Verifique sua conexão com a internet
- Inicie uma nova conversa para ver se o problema persiste
- [Registre um problema no GitHub](https://github.com/qwenlm/qwen-code/issues) caso o problema continue
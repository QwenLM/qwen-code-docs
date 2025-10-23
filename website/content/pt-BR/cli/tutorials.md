# Tutoriais

Esta página contém tutoriais para interagir com o Qwen Code.

## Configurando um servidor Model Context Protocol (MCP)

> [!CAUTION]
> Antes de usar um servidor MCP de terceiros, certifique-se de confiar em sua fonte e entender as ferramentas que ele fornece. Seu uso de servidores de terceiros é por sua conta e risco.

Este tutorial demonstra como configurar um servidor MCP, usando o [GitHub MCP server](https://github.com/github/github-mcp-server) como exemplo. O GitHub MCP server fornece ferramentas para interagir com repositórios do GitHub, como criar issues e comentar em pull requests.

### Pré-requisitos

Antes de começar, certifique-se de ter o seguinte instalado e configurado:

- **Docker:** Instale e execute o [Docker].
- **GitHub Personal Access Token (PAT):** Crie um novo PAT [classic] ou [fine-grained] com os escopos necessários.

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### Guia

#### Configure o servidor MCP no `settings.json`

No diretório raiz do seu projeto, crie ou abra o arquivo [`.qwen/settings.json`](./configuration.md). Dentro do arquivo, adicione o bloco de configuração `mcpServers`, que fornece instruções sobre como iniciar o servidor MCP do GitHub.

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### Defina seu token do GitHub

> [!CAUTION]
> Usar um token de acesso pessoal com escopo amplo que tenha acesso a repositórios pessoais e privados pode levar ao vazamento de informações do repositório privado para o repositório público. Recomendamos usar um token de acesso refinado que não compartilhe acesso a ambos os repositórios públicos e privados.

Use uma variável de ambiente para armazenar seu PAT do GitHub:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

O Qwen Code usa esse valor na configuração `mcpServers` que você definiu no arquivo `settings.json`.

#### Inicie o Qwen Code e verifique a conexão

Quando você inicia o Qwen Code, ele automaticamente lê sua configuração e inicia o servidor GitHub MCP em segundo plano. Você pode então usar prompts em linguagem natural para pedir ao Qwen Code que execute ações no GitHub. Por exemplo:

```bash
"obter todas as issues abertas atribuídas a mim no repositório 'foo/bar' e priorizá-las"
```
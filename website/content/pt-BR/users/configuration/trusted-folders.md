# Pastas Confiáveis

O recurso Pastas Confiáveis é uma configuração de segurança que permite controlar quais projetos podem usar todos os recursos do Qwen Code. Ele impede a execução de código potencialmente malicioso solicitando sua aprovação para uma pasta antes que a CLI carregue qualquer configuração específica do projeto.

## Habilitando o Recurso

O recurso Pastas Confiáveis está **desabilitado por padrão**. Para usá-lo, você precisa primeiro habilitá-lo nas suas configurações.

Adicione o seguinte ao seu arquivo `settings.json` de usuário:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## Como Funciona: O Diálogo de Confiança

Depois que o recurso for habilitado, na primeira vez que você executar o Qwen Code a partir de uma pasta, um diálogo aparecerá automaticamente, solicitando que você faça uma escolha:

- **Confiar na pasta**: Concede confiança total à pasta atual (por exemplo, `my-project`).
- **Confiar na pasta pai**: Concede confiança ao diretório pai (por exemplo, `safe-projects`), o que automaticamente confia em todos os seus subdiretórios também. Isso é útil se você mantiver todos os seus projetos seguros em um único local.
- **Não confiar**: Marca a pasta como não confiável. A CLI operará em um "modo seguro" restrito.

Sua escolha é salva em um arquivo central (`~/.qwen/trustedFolders.json`), então você só será solicitado uma vez por pasta.

## Por Que a Confiança é Importante: O Impacto de um Workspace Não Confiável

Quando uma pasta está **não confiável**, o Qwen Code é executado em um "modo seguro" restrito para proteger você. Nesse modo, os seguintes recursos são desabilitados:

1.  **As Configurações do Workspace São Ignoradas**: A CLI **não** carregará o arquivo `.qwen/settings.json` do projeto. Isso impede o carregamento de ferramentas personalizadas e outras configurações potencialmente perigosas.

2.  **As Variáveis de Ambiente São Ignoradas**: A CLI **não** carregará nenhum arquivo `.env` do projeto.

3.  **O Gerenciamento de Extensões é Restrito**: Você **não pode instalar, atualizar ou desinstalar** extensões.

4.  **A Aceitação Automática de Ferramentas Está Desabilitada**: Você sempre será solicitado antes que qualquer ferramenta seja executada, mesmo que a aceitação automática esteja habilitada globalmente.

5.  **O Carregamento Automático de Memória Está Desabilitado**: A CLI não carregará automaticamente arquivos no contexto a partir de diretórios especificados nas configurações locais.

Conceder confiança a uma pasta desbloqueia a funcionalidade completa do Qwen Code para aquele workspace.

## Gerenciando Suas Configurações de Confiança

Se você precisar alterar uma decisão ou visualizar todas as suas configurações, tem algumas opções:

- **Alterar a Confiança da Pasta Atual**: Execute o comando `/permissions` de dentro da CLI. Isso abrirá o mesmo diálogo interativo, permitindo que você altere o nível de confiança para a pasta atual.

- **Visualizar Todas as Regras de Confiança**: Para ver uma lista completa de todas as suas regras de pastas confiáveis e não confiáveis, você pode inspecionar o conteúdo do arquivo `~/.qwen/trustedFolders.json` no seu diretório home.

## O Processo de Verificação de Confiança (Avançado)

Para usuários avançados, é útil conhecer a ordem exata de operações para determinar a confiança:

1.  **Sinal de Confiança da IDE**: Se você estiver usando a [Integração com IDE](../ide-integration/ide-integration), a CLI primeiro pergunta à IDE se o workspace é confiável. A resposta da IDE tem a maior prioridade.

2.  **Arquivo de Confiança Local**: Se a IDE não estiver conectada, a CLI verifica o arquivo central `~/.qwen/trustedFolders.json`.
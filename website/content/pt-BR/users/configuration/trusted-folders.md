# Pastas Confiáveis

O recurso de Pastas Confiáveis é uma configuração de segurança que oferece controle sobre quais projetos podem utilizar todos os recursos do Qwen Code. Ele evita que códigos potencialmente maliciosos sejam executados, solicitando que você aprove uma pasta antes que a CLI carregue qualquer configuração específica do projeto a partir dela.

## Ativando o Recurso

O recurso de Pastas Confiáveis está **desativado por padrão**. Para utilizá-lo, você deve primeiro ativá-lo nas suas configurações.

Adicione o seguinte ao seu arquivo `settings.json` do usuário:

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

Uma vez que o recurso esteja ativado, na primeira vez que você executar o Qwen Code a partir de uma pasta, um diálogo aparecerá automaticamente, solicitando que você faça uma escolha:

- **Confiar na pasta**: Concede confiança total à pasta atual (por exemplo, `meu-projeto`).
- **Confiar na pasta pai**: Concede confiança ao diretório pai (por exemplo, `projetos-seguros`), o que também concede confiança automaticamente a todos os seus subdiretórios. Isso é útil se você mantiver todos os seus projetos seguros em um único local.
- **Não confiar**: Marca a pasta como não confiável. A CLI operará em um "modo seguro" restrito.

Sua escolha é salva em um arquivo central (`~/.qwen/trustedFolders.json`), portanto, você só será perguntado uma vez por pasta.

## Por Que a Confiança é Importante: O Impacto de um Workspace Não Confiável

Quando uma pasta é **não confiável**, o Qwen Code é executado em um modo restrito "seguro" para proteger você. Nesse modo, os seguintes recursos são desativados:

1.  **As Configurações do Workspace são Ignoradas**: A CLI **não** carregará o arquivo `.qwen/settings.json` do projeto. Isso evita o carregamento de ferramentas personalizadas e outras configurações potencialmente perigosas.

2.  **Variáveis de Ambiente são Ignoradas**: A CLI **não** carregará nenhum arquivo `.env` do projeto.

3.  **O Gerenciamento de Extensões é Restrito**: Você **não pode instalar, atualizar ou desinstalar** extensões.

4.  **A Aceitação Automática de Ferramentas é Desativada**: Você sempre será solicitado antes que qualquer ferramenta seja executada, mesmo se tiver a aceitação automática ativada globalmente.

5.  **O Carregamento Automático de Memória é Desativado**: A CLI não carregará automaticamente arquivos no contexto a partir dos diretórios especificados nas configurações locais.

Conceder confiança a uma pasta libera a funcionalidade completa do Qwen Code para aquele workspace.

## Gerenciando Suas Configurações de Confiança

Se você precisar alterar uma decisão ou visualizar todas as suas configurações, há algumas opções disponíveis:

- **Alterar a Confiança da Pasta Atual**: Execute o comando `/permissions` diretamente no CLI. Isso abrirá o mesmo diálogo interativo, permitindo que você altere o nível de confiança para a pasta atual.

- **Visualizar Todas as Regras de Confiança**: Para ver uma lista completa de todas as regras de pastas confiáveis e não confiáveis, você pode inspecionar o conteúdo do arquivo `~/.qwen/trustedFolders.json` no seu diretório pessoal.

## O Processo de Verificação de Confiança (Avançado)

Para usuários avançados, é útil conhecer a ordem exata das operações usadas para determinar a confiança:

1.  **Sinal de Confiança do IDE**: Se você estiver usando a [Integração com IDE](../users/ide-integration/ide-integration), o CLI primeiro consulta o IDE para saber se o espaço de trabalho é confiável. A resposta do IDE tem a mais alta prioridade.

2.  **Arquivo Local de Confiança**: Se o IDE não estiver conectado, o CLI verifica o arquivo central `~/.qwen/trustedFolders.json`.
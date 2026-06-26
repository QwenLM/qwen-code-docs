# Pastas Confiáveis

O recurso Pastas Confiáveis é uma configuração de segurança que permite controlar quais projetos podem usar todos os recursos do Qwen Code. Ele impede que códigos potencialmente maliciosos sejam executados, solicitando que você aprove uma pasta antes que a CLI carregue qualquer configuração específica do projeto a partir dela.

## Habilitando o Recurso

O recurso Pastas Confiáveis está **desabilitado por padrão**. Para usá-lo, você deve primeiro habilitá-lo nas suas configurações.

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

Uma vez que o recurso está habilitado, na primeira vez que você executar o Qwen Code a partir de uma pasta, uma caixa de diálogo aparecerá automaticamente, solicitando que você faça uma escolha:

- **Confiar na pasta**: Concede confiança total à pasta atual (ex.: `my-project`).
- **Confiar na pasta pai**: Concede confiança ao diretório pai (ex.: `safe-projects`), que automaticamente confia em todas as suas subpastas. Isso é útil se você mantém todos os seus projetos seguros em um só lugar.
- **Não confiar**: Marca a pasta como não confiável. A CLI operará em um "modo seguro" restrito.

Sua escolha é salva em um arquivo central (`~/.qwen/trustedFolders.json`), então você só será perguntado uma vez por pasta.

## Por Que a Confiança é Importante: O Impacto de um Workspace Não Confiável

Quando uma pasta é **não confiável**, o Qwen Code executa em um "modo seguro" restrito para protegê-lo. Neste modo, os seguintes recursos são desabilitados:

1.  **As Configurações do Workspace são Ignoradas**: A CLI **não** carregará o arquivo `.qwen/settings.json` do projeto. Isso impede o carregamento de ferramentas personalizadas e outras configurações potencialmente perigosas.

2.  **As Variáveis de Ambiente são Ignoradas**: A CLI **não** carregará nenhum arquivo `.env` do projeto.

3.  **O Gerenciamento de Extensões é Restrito**: Você **não pode instalar, atualizar ou desinstalar** extensões.

4.  **A Aceitação Automática de Ferramentas é Desabilitada**: Você sempre será solicitado antes de qualquer ferramenta ser executada, mesmo se tiver a aceitação automática habilitada globalmente.

5.  **O Carregamento Automático de Memória é Desabilitado**: A CLI não carregará automaticamente arquivos no contexto a partir de diretórios especificados nas configurações locais.

Conceder confiança a uma pasta desbloqueia toda a funcionalidade do Qwen Code para aquele workspace.

## Gerenciando suas Configurações de Confiança

Se você precisar alterar uma decisão ou ver todas as suas configurações, você tem algumas opções:

- **Alterar a Confiança da Pasta Atual**: Execute o comando `/permissions` dentro da CLI. Isso abrirá o mesmo diálogo interativo, permitindo que você altere o nível de confiança para a pasta atual.

- **Ver Todas as Regras de Confiança**: Para ver uma lista completa de todas as suas regras de pastas confiáveis e não confiáveis, você pode inspecionar o conteúdo do arquivo `~/.qwen/trustedFolders.json` no seu diretório pessoal.

## O Processo de Verificação de Confiança (Avançado)

Para usuários avançados, é útil saber a ordem exata das operações para como a confiança é determinada:

1.  **Sinal de Confiança da IDE**: Se você estiver usando a [Integração com IDE](../ide-integration/ide-integration), a CLI primeiro pergunta à IDE se o workspace é confiável. A resposta da IDE tem a maior prioridade.

2.  **Arquivo de Confiança Local**: Se a IDE não estiver conectada, a CLI verifica o arquivo central `~/.qwen/trustedFolders.json`.
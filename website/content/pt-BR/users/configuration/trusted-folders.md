# Pastas Confiáveis

O recurso Pastas Confiáveis é uma configuração de segurança que permite controlar quais projetos podem usar todas as funcionalidades do Qwen Code. Ele impede a execução de código potencialmente malicioso, solicitando sua aprovação para uma pasta antes que a CLI carregue quaisquer configurações específicas do projeto a partir dela.

## Habilitando o Recurso

O recurso Pastas Confiáveis está **desabilitado por padrão**. Para usá-lo, você deve habilitá-lo primeiro nas suas configurações.

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

Assim que o recurso for ativado, na primeira vez em que você executar o Qwen Code a partir de uma pasta, um diálogo será exibido automaticamente, solicitando que você faça uma escolha:

- **Confiar na pasta**: concede confiança total à pasta atual (por exemplo, `meu-projeto`).  
- **Confiar na pasta pai**: concede confiança ao diretório pai (por exemplo, `projetos-seguros`), o que também confere confiança automaticamente a todos os seus subdiretórios. Essa opção é útil se você mantém todos os seus projetos seguros em um único local.  
- **Não confiar**: marca a pasta como não confiável. A CLI operará em um modo restrito chamado "modo seguro".

Sua escolha é salva em um arquivo central (`~/.qwen/trustedFolders.json`), portanto você será questionado apenas uma vez por pasta.

## Por Que a Confiabilidade é Importante: O Impacto de um Espaço de Trabalho Não Confiável

Quando uma pasta é **não confiável**, o Qwen Code é executado em um modo restrito de “modo seguro” para proteger você. Nesse modo, os seguintes recursos são desabilitados:

1.  **Configurações do Espaço de Trabalho São Ignoradas**: A CLI **não** carregará o arquivo `.qwen/settings.json` do projeto. Isso impede o carregamento de ferramentas personalizadas e outras configurações potencialmente perigosas.

2.  **Variáveis de Ambiente São Ignoradas**: A CLI **não** carregará nenhum arquivo `.env` do projeto.

3.  **Gerenciamento de Extensões É Restrito**: Você **não pode instalar, atualizar ou desinstalar** extensões.

4.  **Aceitação Automática de Ferramentas É Desabilitada**: Você sempre será solicitado antes da execução de qualquer ferramenta, mesmo que tenha habilitado a aceitação automática globalmente.

5.  **Carregamento Automático de Memória É Desabilitado**: A CLI não carregará automaticamente arquivos no contexto a partir de diretórios especificados nas configurações locais.

Conceder confiança a uma pasta libera toda a funcionalidade do Qwen Code para aquele espaço de trabalho.

## Gerenciando suas Configurações de Confiança

Se você precisar alterar uma decisão ou visualizar todas as suas configurações, há algumas opções disponíveis:

- **Alterar a Confiança da Pasta Atual**: Execute o comando `/permissions` diretamente no CLI. Isso exibirá o mesmo diálogo interativo, permitindo que você modifique o nível de confiança para a pasta atual.

- **Visualizar Todas as Regras de Confiança**: Para ver uma lista completa de todas as regras de pastas confiáveis e não confiáveis, examine o conteúdo do arquivo `~/.qwen/trustedFolders.json` no seu diretório pessoal.

## Processo de Verificação de Confiança (Avançado)

Para usuários avançados, é útil conhecer a ordem exata das operações usadas para determinar a confiança:

1.  **Sinal de Confiança da IDE**: Se você estiver usando a [Integração com IDE](../ide-integration/ide-integration), o CLI primeiro consulta a IDE para saber se o workspace está confiável. A resposta da IDE tem prioridade máxima.

2.  **Arquivo Local de Confiança**: Se a IDE não estiver conectada, o CLI verifica o arquivo central `~/.qwen/trustedFolders.json`.
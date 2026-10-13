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

O recurso opera em fail closed: até que você faça uma escolha, uma pasta conta como **não confiável**, e não como confiável por padrão. Se esse arquivo estiver ausente — uma máquina nova, um diretório home restaurado, uma configuração de dotfiles sincronizados — toda pasta que nenhum sinal de maior prioridade decidir (consulte "O Processo de Verificação de Confiança (Avançado)" abaixo) começa como não confiável, incluindo pastas que você confiou anteriormente. Quando uma verificação de confiança alcança as regras do arquivo, um arquivo ilegível, sintaxe JSONC inválida ou um documento não-objeto é um erro grave de configuração. Um carregamento de cache com falha faz a CLI parar com "Please fix the configuration file and try again." e as verificações de confiança v1 do daemon respondem `500 trusted_folders_invalid`; uma decisão de confiança prévia da IDE pode ignorar essas verificações baseadas em arquivo. O gravador de concessão ainda valida o arquivo antes de persistir uma regra. Repare ou remova o arquivo manualmente, depois reinicie o daemon para limpar o carregamento com falha. Comentários e vírgulas finais são aceitos. Valores de nível de confiança inválidos são detectados pelo gravador de concessão e pelo leitor de política v2, mas não são validados pelo leitor legado v1; o v2 reporta erros de política como `200` com `configured.state: "error"`. Um arquivo que se torna inválido após o carregamento de cache pode, em vez disso, falhar durante a escrita de concessão com `500 internal_error`, ou durante a verificação de política pós-escrita com `409 trust_grant_ineffective`.

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

- **Confiar em um Workspace pelo Web Shell**: Abra a visão geral de workspaces e use a ação **Trust** em um workspace não confiável. Isso registra a mesma decisão sem precisar de um terminal, o que é o caminho de volta se todo workspace aparecer como não confiável porque nenhuma regra os decidiu. A ação aparece apenas quando o daemon conectado anuncia `workspace_trust_grant`, o que ocorre apenas onde o hot-reload de confiança aplica a decisão ao runtime em execução — um daemon que serve as rotas de concessão sem hot-reload oculta a ação. Lá, uma concessão registrada através da própria API do daemon atualiza o arquivo de confiança e o status de confiança v1 imediatamente, mas gates de runtime vinculados à inicialização requerem uma reinicialização. Uma decisão registrada por um processo de terminal separado ou uma edição de arquivo não é imediatamente visível para o status v1 em cache do daemon; reinicie o daemon para carregá-la. Onde a ação está disponível, o workspace termina de se tornar confiável assim que o daemon reconstrói seu runtime, o que leva um momento.

- **Ver Todas as Regras de Confiança**: Para ver uma lista completa de todas as suas regras de pastas confiáveis e não confiáveis, você pode inspecionar o conteúdo do arquivo `~/.qwen/trustedFolders.json` no seu diretório pessoal.

## O Processo de Verificação de Confiança (Avançado)

Para usuários avançados, é útil saber a ordem exata das operações para como a confiança é determinada:

1.  **Sinal de Confiança da IDE**: Se você estiver usando a [Integração com IDE](../ide-integration/ide-integration), a CLI primeiro pergunta à IDE se o workspace é confiável. A resposta da IDE tem a maior prioridade.

2.  **Arquivo de Confiança Local**: Se a IDE não estiver conectada, a CLI verifica o arquivo central `~/.qwen/trustedFolders.json`.
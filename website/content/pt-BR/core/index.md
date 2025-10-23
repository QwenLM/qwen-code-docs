# Qwen Code Core

O pacote principal do Qwen Code (`packages/core`) é a parte backend do Qwen Code, responsável por lidar com a comunicação com as APIs dos modelos, gerenciar ferramentas e processar requisições enviadas pelo `packages/cli`. Para uma visão geral geral do Qwen Code, consulte a [página principal da documentação](../index.md).

## Navegando nesta seção

- **[API das ferramentas principais](./tools-api.md):** Informações sobre como as ferramentas são definidas, registradas e utilizadas pelo core.
- **[Processador de Importação de Memória](./memport.md):** Documentação do recurso modular de importação do QWEN.md usando a sintaxe @file.md.

## Função do core

Embora a parte `packages/cli` do Qwen Code forneça a interface do usuário, o `packages/core` é responsável por:

- **Interação com a API do modelo:** Comunicar-se de forma segura com o provedor de modelo configurado, enviar prompts do usuário e receber respostas do modelo.
- **Engenharia de prompt:** Construir prompts eficazes para o modelo, potencialmente incorporando histórico de conversa, definições de ferramentas e contexto instrucional de arquivos de contexto (por exemplo, `QWEN.md`).
- **Gerenciamento e orquestração de ferramentas:**
  - Registrar ferramentas disponíveis (por exemplo, ferramentas do sistema de arquivos, execução de comandos shell).
  - Interpretar solicitações de uso de ferramentas provenientes do modelo.
  - Executar as ferramentas solicitadas com os argumentos fornecidos.
  - Retornar os resultados da execução das ferramentas ao modelo para processamento adicional.
- **Gerenciamento de sessão e estado:** Manter o controle do estado da conversa, incluindo histórico e qualquer contexto relevante necessário para interações coerentes.
- **Configuração:** Gerenciar configurações específicas do core, como acesso à chave da API, seleção de modelo e configurações de ferramentas.

## Considerações de segurança

O core desempenha um papel fundamental na segurança:

- **Gerenciamento de API keys:** Ele cuida das credenciais dos providers e garante que sejam usadas de forma segura ao se comunicar com as APIs.
- **Execução de tools:** Quando as tools interagem com o sistema local (ex.: `run_shell_command`), o core (e suas implementações subjacentes) deve fazê-lo com o devido cuidado, muitas vezes utilizando mecanismos de sandbox para evitar modificações não intencionais.

## Compressão do histórico de chat

Para garantir que conversas longas não ultrapassem os limites de tokens do modelo selecionado, o core inclui um recurso de compressão do histórico de chat.

Quando uma conversa se aproxima do limite de tokens do modelo configurado, o core comprime automaticamente o histórico da conversa antes de enviá-lo ao modelo. Essa compressão é projetada para ser lossless em termos de informação transmitida, mas reduz o número total de tokens utilizados.

Você pode encontrar os limites de tokens para os modelos de cada provider na documentação deles.

## Fallback de modelo

O Qwen Code inclui um mecanismo de fallback de modelo para garantir que você possa continuar usando o CLI mesmo se o modelo padrão estiver com limite de taxa.

Se você estiver usando o modelo "pro" padrão e o CLI detectar que você está sendo limitado por taxa, ele automaticamente muda para o modelo "flash" na sessão atual. Isso permite que você continue trabalhando sem interrupções.

## Serviço de descoberta de arquivos

O serviço de descoberta de arquivos é responsável por encontrar arquivos no projeto que sejam relevantes para o contexto atual. Ele é usado pelo comando `@` e por outras ferramentas que precisam acessar arquivos.

## Serviço de descoberta de memória

O serviço de descoberta de memória é responsável por encontrar e carregar os arquivos de contexto (padrão: `QWEN.md`) que fornecem contexto ao modelo. Ele procura esses arquivos de forma hierárquica, começando do diretório de trabalho atual e subindo até a raiz do projeto e o diretório home do usuário. Também procura em subdiretórios.

Isso permite que você tenha arquivos de contexto globais, no nível do projeto e no nível do componente, que são todos combinados para fornecer ao modelo as informações mais relevantes.

Você pode usar o [comando `/memory`](../cli/commands.md) para `show`, `add` e `refresh` o conteúdo dos arquivos de contexto carregados.
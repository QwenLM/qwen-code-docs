# Solução de problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes às suas ou criação de novas Issues

## Erros de autenticação ou login

- **Erro: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Causa:** O Qwen OAuth não está mais disponível a partir de 15 de abril de 2026.
  - **Solução:** Mude para um método de autenticação diferente. Execute `qwen` → `/auth` e escolha uma das opções:
    - **API Key**: Use uma chave de API do Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Veja o guia de configuração da API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Assine um plano mensal fixo com cotas maiores. Veja o guia do Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado CA raiz personalizado seja confiável para o Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` com o caminho absoluto do arquivo de certificado CA raiz corporativo.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/caminho/para/seu/ca-corporativo.crt`

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu acessar os endpoints do Qwen OAuth (geralmente um problema de proxy ou confiança SSL/TLS). Quando disponível, o Qwen Code também exibirá a causa subjacente do erro (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Nota: esse erro é específico do fluxo legado do Qwen OAuth.
  - **Solução:**
    - Se você ainda está usando o Qwen OAuth, mude para API Key ou Coding Plan através de `/auth`.
    - Se você está atrás de um proxy, configure-o via `qwen --proxy <url>` (ou a configuração `proxy` em `settings.json`).
    - Se sua rede usa um CA de inspeção TLS corporativo, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Incapacidade de exibir a interface após falha de autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo de autenticação, a configuração `security.auth.selectedType` pode ser persistida em `settings.json`. Ao reiniciar, o CLI pode travar ao tentar autenticar com o tipo de autenticação que falhou e não exibir a interface.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie o CLI para permitir que ele solicite autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como atualizar o Qwen Code para a versão mais recente?**
  - R: Se você instalou o Qwen Code com o instalador autônomo, execute novamente o comando de instalação autônoma. Se você o instalou globalmente via `npm`, atualize-o usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se você o compilou a partir do código-fonte, baixe as alterações mais recentes do repositório e reconstrua usando o comando `npm run build`.

- **P: Onde estão armazenados os arquivos de configuração ou configurações do Qwen Code?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. No seu diretório home: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../configuration/settings) para mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na saída de estatísticas?**
  - R: As informações de tokens em cache são exibidas apenas quando tokens em cache estão sendo usados. Esse recurso está disponível para usuários de chave de API (por exemplo, chave de API do Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Você ainda pode visualizar o uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Endereço já em uso) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta à qual o servidor MCP está tentando se vincular.
  - **Solução:**
    Pare o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Comando não encontrado (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** O CLI não está instalado corretamente ou não está no `PATH` do seu sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou `qwen` com o instalador autônomo, execute novamente o comando de instalação autônoma e abra um novo terminal.
    - Se você instalou `qwen` globalmente, verifique se o diretório binário global do `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você está executando `qwen` a partir do código-fonte, certifique-se de usar o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, baixe as alterações mais recentes do repositório e reconstrua usando o comando `npm run build`.
- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente, ou o projeto não foi compilado.
  - **Solução:**
    1.  Execute `npm install` para garantir que todas as dependências estejam presentes.
    2.  Execute `npm run build` para compilar o projeto.
    3.  Verifique se a compilação foi concluída com sucesso usando `npm run start`.

- **Erro: "Operation not permitted", "Permission denied" ou similar.**
  - **Causa:** Quando o sandbox está habilitado, o Qwen Code pode tentar operações que são restritas pela sua configuração de sandbox, como escrever fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandbox](../features/sandbox) para mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está rodando em modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt aparece) se uma variável de ambiente começando com `CI_` (ex.: `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de UI subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com prefixo `CI_`. Quando qualquer uma delas é encontrada, ele sinaliza que o ambiente não é interativo, impedindo que o CLI inicie em seu modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento do CLI, você pode removê-la temporariamente do comando. Exemplo: `env -u CI_TOKEN qwen`

- **Modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo debug para o CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são automaticamente excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento do CLI.
  - **Solução:** Use um arquivo `.qwen/.env` ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

- **Rolagem com trackpad no tmux altera o histórico de prompts em vez de rolar a conversa**
  - **Problema:** Em uma sessão tmux, a rolagem com trackpad ou wheel pode percorrer prompts anteriores, similar a pressionar `Seta para Cima` ou `Seta para Baixo`.
  - **Causa:** O tmux pode traduzir gestos de wheel em sequências comuns de teclas de seta. Essas sequências são indistinguíveis de pressionamentos reais de seta quando recebidas pelo qwen-code.
  - **Solução:** Ative `ui.useTerminalBuffer`; em seguida, use `Shift+Seta para Cima` / `Shift+Seta para Baixo`, ou a roda do mouse quando o tmux encaminhar eventos de wheel para o aplicativo. Se você preferir a rolagem do host, ajuste os bindings de mouse do tmux para eventos de wheel.

## IDE Companion não está conectando

- Certifique-se de que o VS Code tenha uma única pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver rodando em um contêiner, verifique se `host.docker.internal` resolve. Caso contrário, mapeie o host apropriadamente.
- Reinstale o companion com `/ide install` e use "Qwen Code: Run" na Paleta de Comandos para verificar se ele inicia.

## Códigos de Saída

O Qwen Code usa códigos de saída específicos para indicar o motivo da terminação. Isso é especialmente útil para scripts e automação.

| Código de Saída | Tipo de Erro                | Descrição                                                                                            |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 41              | `FatalAuthenticationError`  | Ocorreu um erro durante o processo de autenticação.                                                  |
| 42              | `FatalInputError`           | Foi fornecido um elemento inválido ou ausente ao CLI. (apenas modo não interativo)                   |
| 44              | `FatalSandboxError`         | Ocorreu um erro com o ambiente de sandbox (ex.: Docker, Podman ou Seatbelt).                         |
| 52              | `FatalConfigError`          | Um arquivo de configuração (`settings.json`) é inválido ou contém erros.                             |
| 53              | `FatalTurnLimitedError`     | O número máximo de turnos conversacionais para a sessão foi atingido. (apenas modo não interativo)   |

## Dicas de Depuração

- **Depuração do CLI:**
  - Use a flag `--verbose` (se disponível) com comandos do CLI para obter saída mais detalhada.
  - Verifique os logs do CLI, geralmente encontrados em um diretório de configuração ou cache específico do usuário.

- **Depuração do Core:**
  - Verifique a saída do console do servidor em busca de mensagens de erro ou stack traces.
  - Aumente a verbosidade do log, se configurável.
  - Use ferramentas de depuração do Node.js (ex.: `node --inspect`) se precisar percorrer o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação que a ferramenta realiza.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente no seu shell.
  - Para _ferramentas do sistema de arquivos_, verifique se os caminhos estão corretos e confirme as permissões.
- **Verificações de pré-voo:**
  - Sempre execute `npm run preflight` antes de efetuar commit. Isso pode detectar muitos problemas comuns relacionados a formatação, linting e erros de tipo.

## Problemas existentes no GitHub similares ao seu ou criação de novos Issues

Se você encontrar um problema que não foi abordado neste _Guia de Solução de Problemas_, considere pesquisar o [rastreador de Issues do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se não encontrar uma Issue similar à sua, considere criar uma nova Issue no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!

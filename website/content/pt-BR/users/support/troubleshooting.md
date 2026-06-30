# Solução de problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes à sua ou como criar novas Issues

## Erros de autenticação ou login

- **Erro: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Causa:** O Qwen OAuth não está mais disponível a partir de 15 de abril de 2026.
  - **Solução:** Mude para um método de autenticação diferente. Execute `qwen` → `/auth` e escolha uma das opções:
    - **API Key**: Use uma API key do Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Consulte o guia de configuração da API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Assine por uma taxa mensal fixa com cotas maiores. Consulte o guia do Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado CA raiz personalizado seja confiável pelo Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` com o caminho absoluto do arquivo do certificado CA raiz da sua empresa.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Erro: `Connection error. (cause: fetch failed)` contra um endpoint autoassinado**
  - **Causa:** Você está apontando o Qwen Code para um servidor auto-hospedado (por exemplo, um modelo local atrás de `https://`) cujo certificado TLS é autoassinado, então o Node.js o rejeita.
  - **Solução:** Prefira confiar no certificado via `NODE_EXTRA_CA_CERTS` (acima). Se isso não for prático em um laboratório/rede privada confiável, pule a verificação com a flag `--insecure` (ou `QWEN_TLS_INSECURE=1`):
    - Exemplo: `qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **Aviso:** Desativar a verificação remove a proteção contra ataques man-in-the-middle. Use apenas para endpoints em que você confia totalmente.

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu alcançar os endpoints do Qwen OAuth (geralmente um problema de proxy ou confiança SSL/TLS). Quando disponível, o Qwen Code também imprimirá a causa subjacente do erro (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Nota: este erro é específico do fluxo legado do Qwen OAuth.
  - **Solução:**
    - Se você ainda estiver usando o Qwen OAuth, mude para API Key ou Coding Plan via `/auth`.
    - Se você estiver atrás de um proxy, configure-o via `qwen --proxy <url>` (ou a configuração `proxy` no `settings.json`).
    - Se sua rede usar um CA de inspeção TLS corporativo, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Não é possível exibir a UI após falha na autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo de autenticação, a configuração `security.auth.selectedType` pode ser persistida no `settings.json`. Ao reiniciar, a CLI pode travar tentando autenticar com o tipo de autenticação que falhou e não conseguirá exibir a UI.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para permitir que ela solicite a autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como atualizo o Qwen Code para a versão mais recente?**
  - R: Se você instalou o Qwen Code com o instalador independente, execute novamente o comando de instalação independente. Se o instalou globalmente via `npm`, atualize-o usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se o compilou a partir do código-fonte, faça o pull das alterações mais recentes do repositório e, em seguida, recompile usando o comando `npm run build`.

- **P: Onde os arquivos de configuração ou definições do Qwen Code são armazenados?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. No seu diretório home: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../configuration/settings) para mais detalhes.

- **P: Por que não vejo as contagens de tokens em cache na minha saída de estatísticas?**
  - R: As informações de tokens em cache só são exibidas quando os tokens em cache estão sendo usados. Este recurso está disponível para usuários de API key (por exemplo, API key do Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Você ainda pode visualizar seu uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Address already in use) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta à qual o servidor MCP está tentando se vincular.
  - **Solução:**
    Pare o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Command not found (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não está instalada corretamente ou não está no `PATH` do seu sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou o `qwen` com o instalador independente, execute novamente o comando de instalação independente e abra um novo terminal.
    - Se você instalou o `qwen` globalmente, verifique se o diretório binário global do `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você estiver executando o `qwen` a partir do código-fonte, certifique-se de estar usando o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, faça o pull das alterações mais recentes do repositório e, em seguida, recompile usando o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente ou o projeto não foi compilado.
  - **Solução:**
    1.  Execute `npm install` para garantir que todas as dependências estejam presentes.
    2.  Execute `npm run build` para compilar o projeto.
    3.  Verifique se a compilação foi concluída com sucesso usando `npm run start`.

- **Erro: "Operation not permitted", "Permission denied" ou similar.**
  - **Causa:** Quando o sandbox está habilitado, o Qwen Code pode tentar operações restritas pela sua configuração de sandbox, como escrever fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../features/sandbox) para mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está sendo executado no modo interativo em ambientes de "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt aparece) se uma variável de ambiente que começa com `CI_` (por exemplo, `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de UI subjacente, detecta essas variáveis e assume um ambiente de CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com o prefixo `CI_`. Quando qualquer uma delas é encontrada, sinaliza que o ambiente é não interativo, o que impede que a CLI inicie em seu modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode desconfigurá-la temporariamente para o comando. Ex.: `env -u CI_TOKEN qwen`

- **O modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não habilita o modo de depuração para a CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são automaticamente excluídas dos arquivos `.env` do projeto para evitar interferências no comportamento da CLI.
  - **Solução:** Use um arquivo `.qwen/.env` em vez disso, ou configure a definição `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

- **A rolagem do trackpad no tmux altera o histórico de prompts em vez de rolar a conversa**
  - **Problema:** Em uma sessão do tmux, a rolagem do trackpad ou da roda do mouse pode alternar entre os prompts anteriores, de forma semelhante a pressionar `Up Arrow` ou `Down Arrow`.
  - **Causa:** O tmux pode traduzir gestos da roda do mouse em sequências simples de teclas de seta. Essas sequências são indistinguíveis de pressionamentos reais de teclas de seta no momento em que o qwen-code as recebe.
  - **Solução:** Habilite `ui.useTerminalBuffer`; em seguida, use `Shift+Up` / `Shift+Down` ou a roda do mouse quando o tmux encaminhar eventos da roda para o aplicativo. Se preferir o scrollback do host, ajuste as associações de mouse do tmux para eventos da roda.

## IDE Companion não conectando

- Certifique-se de que o VS Code tenha uma única pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver executando em um contêiner, verifique se `host.docker.internal` é resolvido. Caso contrário, mapeie o host adequadamente.
- Reinstale o companion com `/ide install` e use "Qwen Code: Run" na Command Palette para verificar se ele é iniciado.

## Códigos de saída

O Qwen Code usa códigos de saída específicos para indicar o motivo do encerramento. Isso é especialmente útil para scripts e automação.

| Código de saída | Tipo de erro                 | Descrição                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Ocorreu um erro durante o processo de autenticação.                                                |
| 42        | `FatalInputError`          | Uma entrada inválida ou ausente foi fornecida à CLI. (somente modo não interativo)                       |
| 44        | `FatalSandboxError`        | Ocorreu um erro no ambiente de sandbox (por exemplo, Docker, Podman ou Seatbelt).               |
| 52        | `FatalConfigError`         | Um arquivo de configuração (`settings.json`) é inválido ou contém erros.                               |
| 53        | `FatalTurnLimitedError`    | O número máximo de turnos de conversa para a sessão foi atingido. (somente modo não interativo) |

## Dicas de depuração

- **Depuração da CLI:**
  - Use a flag `--verbose` (se disponível) com os comandos da CLI para uma saída mais detalhada.
  - Verifique os logs da CLI, geralmente encontrados em um diretório de configuração ou cache específico do usuário.

- **Depuração do core:**
  - Verifique a saída do console do servidor para mensagens de erro ou stack traces.
  - Aumente a verbosidade do log se for configurável.
  - Use as ferramentas de depuração do Node.js (por exemplo, `node --inspect`) se precisar percorrer o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação que a ferramenta realiza.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente no seu shell.
  - Para _ferramentas de sistema de arquivos_, verifique se os caminhos estão corretos e cheque as permissões.

- **Verificações pré-voo:**
  - Sempre execute `npm run preflight` antes de fazer commit do código. Isso pode detectar muitos problemas comuns relacionados à formatação, linting e erros de tipo.

## Issues existentes no GitHub semelhantes à sua ou como criar novas Issues

Se você encontrar um problema que não foi abordado aqui neste _guia de solução de problemas_, considere pesquisar o [rastreador de Issues do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se não conseguir encontrar uma Issue semelhante à sua, considere criar uma nova Issue no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!
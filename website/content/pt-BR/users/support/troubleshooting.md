# Solução de problemas

Este guia oferece soluções para problemas comuns e dicas de depuração, abordando os seguintes tópicos:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes à sua ou criação de novas Issues

## Erros de autenticação ou login

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado CA raiz personalizado seja confiável para o Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` com o caminho absoluto do arquivo do certificado CA raiz da sua empresa.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu acessar os endpoints OAuth do Qwen (geralmente um problema de proxy ou confiança SSL/TLS). Quando disponível, o Qwen Code também exibirá a causa subjacente do erro (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Solução:**
    - Confirme se você consegue acessar `https://chat.qwen.ai` a partir da mesma máquina/rede.
    - Se estiver atrás de um proxy, configure-o via `qwen --proxy <url>` (ou a configuração `proxy` no `settings.json`).
    - Se sua rede usar uma CA corporativa de inspeção TLS, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Não é possível exibir a UI após falha na autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo, a configuração `security.auth.selectedType` pode ser persistida no `settings.json`. Na reinicialização, a CLI pode travar tentando autenticar com o tipo que falhou e não exibir a UI.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para que ela solicite a autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como atualizo o Qwen Code para a versão mais recente?**
  - R: Se você o instalou globalmente via `npm`, atualize-o usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se compilou a partir do código-fonte, faça pull das alterações mais recentes do repositório e recompile usando o comando `npm run build`.

- **P: Onde os arquivos de configuração ou settings do Qwen Code são armazenados?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. No seu diretório home: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../configuration/settings) para mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na minha saída de stats?**
  - R: As informações de tokens em cache só são exibidas quando tokens em cache estão sendo usados. Esse recurso está disponível para usuários de API key (Qwen API key ou Google Cloud Vertex AI), mas não para usuários OAuth (como contas Google Pessoais/Corporativas, por exemplo, Google Gmail ou Google Workspace, respectivamente). Isso ocorre porque a Qwen Code Assist API não suporta a criação de conteúdo em cache. Você ainda pode visualizar seu uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Address already in use) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta à qual o servidor MCP está tentando se vincular.
  - **Solução:** Pare o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Command not found (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não está instalada corretamente ou não está no `PATH` do seu sistema.
  - **Solução:** A atualização depende de como você instalou o Qwen Code:
    - Se instalou o `qwen` globalmente, verifique se o diretório de binários globais do `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se estiver executando o `qwen` a partir do código-fonte, certifique-se de usar o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, faça pull das alterações mais recentes do repositório e recompile usando o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente ou o projeto não foi compilado.
  - **Solução:**
    1. Execute `npm install` para garantir que todas as dependências estejam presentes.
    2. Execute `npm run build` para compilar o projeto.
    3. Verifique se a compilação foi concluída com sucesso com `npm run start`.

- **Erro: "Operation not permitted", "Permission denied" ou similar.**
  - **Causa:** Quando o sandboxing está ativado, o Qwen Code pode tentar operações restritas pela sua configuração de sandbox, como gravar fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../features/sandbox) para mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está executando no modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt aparece) se uma variável de ambiente que começa com `CI_` (por exemplo, `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de UI subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com o prefixo `CI_`. Quando qualquer uma delas é encontrada, sinaliza que o ambiente é não interativo, o que impede a CLI de iniciar no modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode removê-la temporariamente para o comando. Ex.: `env -u CI_TOKEN qwen`

- **O modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo de depuração para a CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são excluídas automaticamente dos arquivos `.env` do projeto para evitar interferência no comportamento da CLI.
  - **Solução:** Use um arquivo `.qwen/.env` ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

## IDE Companion não conecta

- Certifique-se de que o VS Code tenha apenas uma pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver executando em um container, verifique se `host.docker.internal` é resolvido. Caso contrário, mapeie o host adequadamente.
- Reinstale o companion com `/ide install` e use “Qwen Code: Run” na Command Palette para verificar se ele inicia.

## Códigos de saída

O Qwen Code usa códigos de saída específicos para indicar o motivo do encerramento. Isso é especialmente útil para scripting e automação.

| Código de saída | Tipo de erro               | Descrição                                                                                           |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Ocorreu um erro durante o processo de autenticação.                                                 |
| 42        | `FatalInputError`          | Entrada inválida ou ausente foi fornecida à CLI. (somente modo não interativo)                      |
| 44        | `FatalSandboxError`        | Ocorreu um erro no ambiente de sandboxing (por exemplo, Docker, Podman ou Seatbelt).                |
| 52        | `FatalConfigError`         | Um arquivo de configuração (`settings.json`) é inválido ou contém erros.                            |
| 53        | `FatalTurnLimitedError`    | O número máximo de turnos de conversa para a sessão foi atingido. (somente modo não interativo)     |

## Dicas de depuração

- **Depuração da CLI:**
  - Use a flag `--verbose` (se disponível) com comandos da CLI para uma saída mais detalhada.
  - Verifique os logs da CLI, geralmente localizados em um diretório de configuração ou cache específico do usuário.

- **Depuração do core:**
  - Verifique a saída do console do servidor em busca de mensagens de erro ou stack traces.
  - Aumente a verbosidade dos logs, se configurável.
  - Use ferramentas de depuração do Node.js (por exemplo, `node --inspect`) se precisar percorrer o código do servidor passo a passo.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação que a ferramenta realiza.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente no seu shell.
  - Para _ferramentas de sistema de arquivos_, verifique se os caminhos estão corretos e confira as permissões.

- **Verificações pré-execução (pre-flight):**
  - Execute sempre `npm run preflight` antes de fazer commit do código. Isso pode detectar muitos problemas comuns relacionados a formatação, linting e erros de tipo.

## Issues existentes no GitHub semelhantes à sua ou criação de novas Issues

Se você encontrar um problema que não foi abordado neste _guia de solução de problemas_, considere pesquisar no [rastreador de Issues do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se não encontrar uma issue semelhante à sua, considere criar uma nova GitHub Issue com uma descrição detalhada. Pull requests também são bem-vindos!
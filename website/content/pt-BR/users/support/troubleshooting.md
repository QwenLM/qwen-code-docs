# Solução de problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes às suas ou criação de novas Issues

## Erros de autenticação ou login

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado CA raiz personalizado seja confiável pelo Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` para o caminho absoluto do arquivo de certificado CA raiz corporativo.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/caminho/para/seu/certificado-ca-corporativo.crt`

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu acessar os endpoints OAuth da Qwen (geralmente um problema de proxy ou confiança SSL/TLS). Quando disponível, o Qwen Code também imprimirá a causa subjacente do erro (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Solução:**
    - Confirme se você consegue acessar `https://chat.qwen.ai` a partir da mesma máquina/rede.
    - Se estiver atrás de um proxy, configure-o via `qwen --proxy <url>` (ou a configuração `proxy` em `settings.json`).
    - Se sua rede usar uma CA de inspeção TLS corporativa, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Não é possível exibir a interface após falha de autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo de autenticação, a configuração `security.auth.selectedType` pode ser persistida em `settings.json`. Ao reiniciar, a CLI pode travar tentando autenticar com o tipo de autenticação que falhou e não exibir a interface.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para permitir que ela solicite autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como faço para atualizar o Qwen Code para a versão mais recente?**
  - R: Se você instalou globalmente via `npm`, atualize-o usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se compilou a partir do código-fonte, busque as últimas alterações do repositório e, em seguida, reconstrua usando o comando `npm run build`.

- **P: Onde os arquivos de configuração ou definições do Qwen Code são armazenados?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. No seu diretório pessoal: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../configuration/settings) para mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na saída das minhas estatísticas?**
  - R: As informações de tokens em cache só são exibidas quando os tokens em cache estão sendo utilizados. Esse recurso está disponível apenas para usuários com chave de API (chave da API Qwen ou Google Cloud Vertex AI), mas não para usuários OAuth (como contas pessoais ou corporativas do Google, como Gmail ou Google Workspace, respectivamente). Isso ocorre porque a API Qwen Code Assist não suporta a criação de conteúdo em cache. Você ainda pode visualizar seu uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Endereço já em uso) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta à qual o servidor MCP está tentando se vincular.
  - **Solução:**
    Pare o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Comando não encontrado (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não está instalada corretamente ou não está no `PATH` do seu sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou o `qwen` globalmente, verifique se o diretório binário global do seu `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você está executando o `qwen` a partir do código-fonte, certifique-se de estar usando o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, busque as últimas alterações do repositório e, em seguida, reconstrua usando o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente ou o projeto ainda não foi construído.
  - **Solução:**
    1. Execute `npm install` para garantir que todas as dependências estejam presentes.
    2. Execute `npm run build` para compilar o projeto.
    3. Verifique se a compilação foi concluída com sucesso com `npm run start`.

- **Erro: "Operação não permitida", "Permissão negada" ou similar.**
  - **Causa:** Quando o sandboxing está habilitado, o Qwen Code pode tentar operações que são restritas pela sua configuração de sandbox, como gravar fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../features/sandbox) para obter mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está sendo executado no modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt aparece) se uma variável de ambiente começando com `CI_` (por exemplo, `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de interface do usuário subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com prefixo `CI_`. Quando alguma dessas é encontrada, sinaliza que o ambiente é não interativo, o que impede que a CLI seja iniciada em seu modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode desativá-la temporariamente para o comando. Por exemplo: `env -u CI_TOKEN qwen`

- **Modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo de depuração para a CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são automaticamente excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento da CLI.
  - **Solução:** Em vez disso, use um arquivo `.qwen/.env` ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

## IDE Companion não está conectando

- Verifique se o VS Code tem uma única pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver executando em um contêiner, verifique se `host.docker.internal` é resolvido. Caso contrário, mapeie o host adequadamente.
- Reinstale o companion com `/ide install` e use "Qwen Code: Run" na Paleta de Comandos para verificar se ele é iniciado.

## Códigos de Saída

O Qwen Code usa códigos de saída específicos para indicar o motivo da finalização. Isso é especialmente útil para scripts e automação.

| Código de Saída | Tipo de Erro               | Descrição                                                                                           |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41              | `FatalAuthenticationError` | Ocorreu um erro durante o processo de autenticação.                                                 |
| 42              | `FatalInputError`          | Foi fornecida entrada inválida ou ausente para a CLI. (modo não interativo apenas)                  |
| 44              | `FatalSandboxError`        | Ocorreu um erro com o ambiente de sandboxing (por exemplo, Docker, Podman ou Seatbelt).             |
| 52              | `FatalConfigError`         | Um arquivo de configuração (`settings.json`) é inválido ou contém erros.                            |
| 53              | `FatalTurnLimitedError`    | Foi atingido o número máximo de turnos conversacionais para a sessão. (modo não interativo apenas) |

## Dicas de Depuração

- **Depuração via CLI:**
  - Use a flag `--verbose` (se disponível) com comandos CLI para obter uma saída mais detalhada.
  - Verifique os logs da CLI, geralmente encontrados em um diretório de configuração ou cache específico do usuário.

- **Depuração do núcleo:**
  - Verifique a saída do console do servidor por mensagens de erro ou rastreamentos de pilha.
  - Aumente a verbosidade dos logs se configurável.
  - Use ferramentas de depuração do Node.js (por exemplo, `node --inspect`) se precisar percorrer o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação que a ferramenta realiza.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente em seu shell.
  - Para _ferramentas de sistema de arquivos_, verifique se os caminhos estão corretos e confira as permissões.

- **Verificações prévias:**
  - Sempre execute `npm run preflight` antes de fazer commit do código. Isso pode detectar muitos problemas comuns relacionados à formatação, lintagem e erros de tipo.

## Problemas existentes no GitHub semelhantes aos seus ou criação de novos problemas

Se você encontrar um problema que não foi abordado aqui neste _Guia de solução de problemas_, considere pesquisar no [rastreador de problemas do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se você não conseguir encontrar um problema semelhante ao seu, considere criar um novo problema no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!
# Solução de problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQ)
- Dicas de depuração
- Problemas existentes no GitHub semelhantes ao seu ou a criação de novos problemas

## Erros de autenticação ou login

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado RA (Certificate Authority) personalizado seja confiável pelo Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` com o caminho absoluto do arquivo do certificado RA corporativo.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/caminho/para/seu/certificado-ra-corporativo.crt`

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu acessar os endpoints OAuth da Qwen (geralmente devido a um problema de proxy ou de confiança SSL/TLS). Quando disponível, o Qwen Code também exibirá a causa subjacente do erro (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Solução:**
    - Confirme se você consegue acessar `https://chat.qwen.ai` a partir da mesma máquina/rede.
    - Se estiver atrás de um proxy, configure-o usando `qwen --proxy <url>` (ou a configuração `proxy` no arquivo `settings.json`).
    - Se sua rede utilizar uma autoridade certificadora corporativa para inspeção TLS, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Não é possível exibir a interface gráfica após falha na autenticação**
  - **Causa:** Se a autenticação falhar após a seleção de um tipo de autenticação, a configuração `security.auth.selectedType` pode ser persistida no arquivo `settings.json`. Ao reiniciar, a CLI pode ficar travada tentando autenticar com o tipo de autenticação que falhou e, consequentemente, não exibir a interface gráfica.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas de projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para que ela solicite novamente a autenticação

## Perguntas frequentes (FAQ)

- **P: Como atualizo o Qwen Code para a versão mais recente?**  
  - R: Se você instalou-o globalmente via `npm`, atualize-o com o comando `npm install -g @qwen-code/qwen-code@latest`. Se você compilou-o a partir do código-fonte, faça o *pull* das alterações mais recentes do repositório e, em seguida, reconstrua-o com o comando `npm run build`.

- **P: Onde os arquivos de configuração ou definições do Qwen Code são armazenados?**  
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:  
    1. No seu diretório pessoal: `~/.qwen/settings.json`.  
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.  

    Consulte [Configuração do Qwen Code](../configuration/settings) para obter mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na saída das minhas estatísticas?**  
  - R: As informações de tokens em cache são exibidas apenas quando tokens em cache estão sendo utilizados. Esse recurso está disponível para usuários de chave de API (chave de API do Qwen ou Google Cloud Vertex AI), mas não para usuários de OAuth (como contas pessoais ou empresariais do Google, por exemplo, Gmail ou Google Workspace, respectivamente). Isso ocorre porque a API Qwen Code Assist não suporta a criação de conteúdo em cache. Você ainda pode visualizar seu uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Endereço já em uso) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta à qual o servidor MCP tenta se vincular.
  - **Solução:**
    Interrompa o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Comando não encontrado (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não foi instalada corretamente ou não está no `PATH` do seu sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou `qwen` globalmente, verifique se o diretório binário global do `npm` está no seu `PATH`. Você pode atualizar com o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você estiver executando `qwen` a partir do código-fonte, certifique-se de estar usando o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, busque as alterações mais recentes do repositório e, em seguida, reconstrua com o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não foram instaladas corretamente ou o projeto ainda não foi compilado.
  - **Solução:**
    1.  Execute `npm install` para garantir que todas as dependências estejam presentes.
    2.  Execute `npm run build` para compilar o projeto.
    3.  Verifique se a compilação foi concluída com sucesso com `npm run start`.

- **Erro: "Operação não permitida", "Permissão negada" ou semelhante.**
  - **Causa:** Quando o sandboxing está habilitado, o Qwen Code pode tentar operações restritas pela sua configuração de sandbox, como gravar fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../features/sandbox) para obter mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não é executado em modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt é exibido) se uma variável de ambiente iniciada com `CI_` (por exemplo, `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pela estrutura de interface do usuário subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com prefixo `CI_`. Quando qualquer uma delas for encontrada, ele sinaliza que o ambiente é não interativo, impedindo que a CLI inicie em seu modo interativo.
  - **Solução:** Se a variável de ambiente com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode removê-la temporariamente para esse comando. Por exemplo: `env -u CI_TOKEN qwen`

- **Modo DEBUG não funciona a partir do arquivo `.env` do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo de depuração na CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são automaticamente excluídas dos arquivos `.env` de projeto para evitar interferência no comportamento da CLI.
  - **Solução:** Use um arquivo `.qwen/.env` em vez disso, ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

## Companheiro da IDE não está se conectando

- Certifique-se de que o VS Code tenha apenas uma pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver executando em um contêiner, verifique se `host.docker.internal` é resolvido. Caso contrário, mapeie o host adequadamente.
- Reinstale o companheiro com `/ide install` e use “Qwen Code: Run” na Paleta de Comandos para verificar se ele é iniciado.

## Códigos de Saída

O Qwen Code usa códigos de saída específicos para indicar o motivo da finalização. Isso é especialmente útil para scripts e automação.

| Código de Saída | Tipo de Erro                  | Descrição                                                                                         |
| --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| 41              | `FatalAuthenticationError`    | Ocorreu um erro durante o processo de autenticação.                                                |
| 42              | `FatalInputError`             | Foi fornecida uma entrada inválida ou ausente para a CLI. (modo não interativo apenas)             |
| 44              | `FatalSandboxError`           | Ocorreu um erro com o ambiente de sandbox (por exemplo, Docker, Podman ou Seatbelt).              |
| 52              | `FatalConfigError`            | O arquivo de configuração (`settings.json`) é inválido ou contém erros.                            |
| 53              | `FatalTurnLimitedError`       | O número máximo de turnos de conversa para a sessão foi atingido. (modo não interativo apenas)     |

## Dicas de Depuração

- **Depuração da CLI:**
  - Use a flag `--verbose` (se disponível) com os comandos da CLI para obter uma saída mais detalhada.
  - Verifique os logs da CLI, geralmente localizados em um diretório de configuração ou cache específico do usuário.

- **Depuração do núcleo:**
  - Verifique a saída do console do servidor em busca de mensagens de erro ou rastreamentos de pilha (*stack traces*).
  - Aumente o nível de verbosidade dos logs, se essa configuração for possível.
  - Use ferramentas de depuração do Node.js (por exemplo, `node --inspect`) se precisar depurar passo a passo o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação realizada por essa ferramenta.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente no seu shell.
  - Para _ferramentas do sistema de arquivos_, confirme se os caminhos estão corretos e verifique as permissões.

- **Verificações pré-voo (*pre-flight checks*):**
  - Sempre execute `npm run preflight` antes de fazer *commit* do código. Isso pode identificar muitos problemas comuns relacionados à formatação, análise estática (*linting*) e erros de tipo.

## Problemas existentes no GitHub semelhantes ao seu ou criação de novos problemas

Se você encontrar um problema que não foi abordado neste _Guia de solução de problemas_, considere pesquisar no [rastreador de problemas do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se não for possível encontrar um problema semelhante ao seu, considere criar um novo problema no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!
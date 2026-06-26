# Solução de problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes às suas ou criação de novas Issues

## Erros de autenticação ou login

- **Erro: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Causa:** O Qwen OAuth não está mais disponível a partir de 15 de abril de 2026.
  - **Solução:** Mude para um método de autenticação diferente. Execute `qwen` → `/auth` e escolha um dos seguintes:
    - **API Key**: Use uma chave de API do Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Veja o guia de configuração da API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Assine por uma taxa mensal fixa com cotas maiores. Veja o guia do Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente requer que um certificado CA raiz personalizado seja confiável pelo Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` com o caminho absoluto do arquivo de certificado CA raiz corporativo.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/caminho/para/seu/certificado-ca-corporativo.crt`

- **Erro: `Device authorization flow failed: fetch failed`**
  - **Causa:** O Node.js não conseguiu acessar os endpoints do Qwen OAuth (muitas vezes um problema de proxy ou confiança SSL/TLS). Quando disponível, o Qwen Code também exibirá a causa do erro subjacente (por exemplo: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Nota: este erro é específico do fluxo legado do Qwen OAuth.
  - **Solução:**
    - Se você ainda estiver usando o Qwen OAuth, mude para API Key ou Coding Plan via `/auth`.
    - Se você estiver atrás de um proxy, configure-o via `qwen --proxy <url>` (ou a configuração `proxy` no `settings.json`).
    - Se sua rede usa um CA de inspeção TLS corporativo, defina `NODE_EXTRA_CA_CERTS` conforme descrito acima.

- **Problema: Incapacidade de exibir a interface após falha de autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo de autenticação, a configuração `security.auth.selectedType` pode ser mantida no `settings.json`. Ao reiniciar, a CLI pode travar tentando autenticar com o tipo de autenticação que falhou e não exibir a interface.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para permitir que ela solicite autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como atualizar o Qwen Code para a versão mais recente?**
  - R: Se você instalou o Qwen Code com o instalador standalone, execute novamente o comando de instalação standalone. Se você instalou globalmente via `npm`, atualize usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se você compilou a partir do código-fonte, puxe as últimas alterações do repositório e depois recompile usando o comando `npm run build`.

- **P: Onde os arquivos de configuração do Qwen Code estão armazenados?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. No seu diretório home: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../configuration/settings) para mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na minha saída de estatísticas?**
  - R: As informações de tokens em cache são exibidas apenas quando tokens em cache estão sendo usados. Este recurso está disponível para usuários de chave de API (por exemplo, chave de API do Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Você ainda pode visualizar seu uso total de tokens usando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Endereço já em uso) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está usando a porta que o servidor MCP está tentando vincular.
  - **Solução:**
    Pare o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Comando não encontrado (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não está instalada corretamente ou não está no `PATH` do seu sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou o `qwen` com o instalador standalone, execute novamente o comando de instalação standalone e depois abra um novo terminal.
    - Se você instalou o `qwen` globalmente, verifique se o diretório de binários globais do `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você está executando o `qwen` a partir do código-fonte, certifique-se de usar o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, puxe as últimas alterações do repositório e depois recompile usando o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente ou o projeto não foi compilado.
  - **Solução:**
    1. Execute `npm install` para garantir que todas as dependências estejam presentes.
    2. Execute `npm run build` para compilar o projeto.
    3. Verifique se a compilação foi concluída com êxito com `npm run start`.

- **Erro: "Operation not permitted", "Permission denied" ou semelhante.**
  - **Causa:** Quando o sandboxing está ativado, o Qwen Code pode tentar operações que são restritas pela sua configuração de sandbox, como escrever fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../features/sandbox) para mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está rodando em modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra em modo interativo (nenhum prompt aparece) se uma variável de ambiente começando com `CI_` (por exemplo, `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de interface subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com prefixo `CI_`. Quando qualquer uma delas é encontrada, ele sinaliza que o ambiente não é interativo, o que impede a CLI de iniciar no modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode temporariamente removê-la para o comando. Por exemplo: `env -u CI_TOKEN qwen`

- **Modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo de depuração para a CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são excluídas automaticamente dos arquivos `.env` do projeto para evitar interferência com o comportamento da CLI.
  - **Solução:** Use um arquivo `.qwen/.env` em vez disso, ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

- **Rolagem do trackpad no tmux altera o histórico do prompt em vez de rolar a conversa**
  - **Problema:** Em uma sessão tmux, a rolagem do trackpad ou da roda do mouse pode percorrer prompts anteriores, semelhante a pressionar `Seta para Cima` ou `Seta para Baixo`.
  - **Causa:** O tmux pode traduzir gestos de rolagem em sequências simples de teclas de seta. Essas sequências são indistinguíveis de pressionamentos reais de teclas de seta quando o qwen-code as recebe.
  - **Solução:** Ative `ui.useTerminalBuffer`; em seguida, use `Shift+Seta para Cima` / `Shift+Seta para Baixo`, ou a roda do mouse quando o tmux encaminhar eventos de rolagem para o aplicativo. Se preferir a rolagem do host, ajuste os atalhos do mouse do tmux para eventos de rolagem.

## Complemento IDE não está conectando

- Certifique-se de que o VS Code tenha apenas uma pasta de espaço de trabalho aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver executando em um contêiner, verifique se `host.docker.internal` resolve. Caso contrário, mapeie o host adequadamente.
- Reinstale o complemento com `/ide install` e use "Qwen Code: Run" na Paleta de Comandos para verificar se ele inicia.

## Códigos de Saída

O Qwen Code usa códigos de saída específicos para indicar o motivo do término. Isso é especialmente útil para scripts e automação.

| Código de Saída | Tipo de Erro               | Descrição                                                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 41              | `FatalAuthenticationError` | Ocorreu um erro durante o processo de autenticação.                                              |
| 42              | `FatalInputError`          | Entrada inválida ou ausente foi fornecida à CLI. (apenas modo não interativo)                    |
| 44              | `FatalSandboxError`        | Ocorreu um erro com o ambiente de sandboxing (por exemplo, Docker, Podman ou Seatbelt).          |
| 52              | `FatalConfigError`         | Um arquivo de configuração (`settings.json`) é inválido ou contém erros.                          |
| 53              | `FatalTurnLimitedError`    | O número máximo de turnos de conversa para a sessão foi atingido. (apenas modo não interativo)   |

## Dicas de Depuração

- **Depuração da CLI:**
  - Use a flag `--verbose` (se disponível) com comandos da CLI para obter uma saída mais detalhada.
  - Verifique os logs da CLI, geralmente encontrados em um diretório de configuração ou cache específico do usuário.

- **Depuração principal:**
  - Verifique a saída do console do servidor em busca de mensagens de erro ou rastreamentos de pilha.
  - Aumente a verbosidade do log se for configurável.
  - Use ferramentas de depuração do Node.js (por exemplo, `node --inspect`) se você precisar percorrer o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação que a ferramenta executa.
  - Para `run_shell_command`, verifique se o comando funciona diretamente no seu shell primeiro.
  - Para _ferramentas de sistema de arquivos_, verifique se os caminhos estão corretos e verifique as permissões.

- **Verificações prévias:**
  - Sempre execute `npm run preflight` antes de enviar código. Isso pode detectar muitos problemas comuns relacionados a formatação, linting e erros de tipo.

## Issues existentes no GitHub semelhantes às suas ou criação de novas Issues

Se você encontrar um problema que não foi abordado aqui neste _Guia de solução de problemas_, considere pesquisar no [rastreador de Issues do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se você não encontrar um issue semelhante ao seu, considere criar um novo Issue no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!
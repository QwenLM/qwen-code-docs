# Solução de Problemas

Este guia fornece soluções para problemas comuns e dicas de depuração, incluindo tópicos sobre:

- Erros de autenticação ou login
- Perguntas frequentes (FAQs)
- Dicas de depuração
- Issues existentes no GitHub semelhantes às suas ou criação de novas Issues

## Erros de autenticação ou login

- **Erro: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ou `unable to get local issuer certificate`**
  - **Causa:** Você pode estar em uma rede corporativa com um firewall que intercepta e inspeciona o tráfego SSL/TLS. Isso geralmente exige que um certificado raiz CA personalizado seja confiável pelo Node.js.
  - **Solução:** Defina a variável de ambiente `NODE_EXTRA_CA_CERTS` para o caminho absoluto do arquivo do certificado raiz CA da sua empresa.
    - Exemplo: `export NODE_EXTRA_CA_CERTS=/caminho/para/seu/corporate-ca.crt`

- **Problema: Não é possível exibir a interface após falha na autenticação**
  - **Causa:** Se a autenticação falhar após selecionar um tipo de autenticação, a configuração `security.auth.selectedType` pode ser persistida em `settings.json`. Ao reiniciar, a CLI pode ficar presa tentando autenticar com o tipo de autenticação que falhou e não conseguir exibir a interface.
  - **Solução:** Limpe o item de configuração `security.auth.selectedType` no seu arquivo `settings.json`:
    - Abra `~/.qwen/settings.json` (ou `./.qwen/settings.json` para configurações específicas do projeto)
    - Remova o campo `security.auth.selectedType`
    - Reinicie a CLI para permitir que ela solicite a autenticação novamente

## Perguntas frequentes (FAQs)

- **P: Como faço para atualizar o Qwen Code para a versão mais recente?**
  - R: Se você o instalou globalmente via `npm`, atualize-o usando o comando `npm install -g @qwen-code/qwen-code@latest`. Se você o compilou a partir do código-fonte, obtenha as últimas alterações do repositório e reconstrua usando o comando `npm run build`.

- **P: Onde estão armazenados os arquivos de configuração ou definições do Qwen Code?**
  - R: A configuração do Qwen Code é armazenada em dois arquivos `settings.json`:
    1. Em seu diretório pessoal: `~/.qwen/settings.json`.
    2. No diretório raiz do seu projeto: `./.qwen/settings.json`.

    Consulte [Configuração do Qwen Code](../users/configuration/settings) para obter mais detalhes.

- **P: Por que não vejo contagens de tokens em cache na saída das minhas estatísticas?**
  - R: As informações de tokens em cache só são exibidas quando tokens em cache estão sendo utilizados. Este recurso está disponível para usuários com chave de API (chave da API Qwen ou Google Cloud Vertex AI), mas não para usuários OAuth (como contas pessoais/empresariais do Google, por exemplo, Gmail do Google ou Google Workspace). Isso ocorre porque a API do Qwen Code Assist não suporta a criação de conteúdo em cache. Você ainda pode visualizar o uso total de tokens utilizando o comando `/stats`.

## Mensagens de erro comuns e soluções

- **Erro: `EADDRINUSE` (Endereço já em uso) ao iniciar um servidor MCP.**
  - **Causa:** Outro processo já está utilizando a porta à qual o servidor MCP está tentando se vincular.
  - **Solução:**
    Interrompa o outro processo que está usando a porta ou configure o servidor MCP para usar uma porta diferente.

- **Erro: Comando não encontrado (ao tentar executar o Qwen Code com `qwen`).**
  - **Causa:** A CLI não está instalada corretamente ou não está no `PATH` do sistema.
  - **Solução:**
    A atualização depende de como você instalou o Qwen Code:
    - Se você instalou `qwen` globalmente, verifique se o diretório binário global do `npm` está no seu `PATH`. Você pode atualizar usando o comando `npm install -g @qwen-code/qwen-code@latest`.
    - Se você estiver executando `qwen` a partir do código-fonte, certifique-se de estar usando o comando correto para invocá-lo (por exemplo, `node packages/cli/dist/index.js ...`). Para atualizar, faça pull das últimas alterações do repositório e reconstrua usando o comando `npm run build`.

- **Erro: `MODULE_NOT_FOUND` ou erros de importação.**
  - **Causa:** As dependências não estão instaladas corretamente ou o projeto não foi compilado.
  - **Solução:**
    1. Execute `npm install` para garantir que todas as dependências estejam presentes.
    2. Execute `npm run build` para compilar o projeto.
    3. Verifique se a compilação foi concluída com sucesso com `npm run start`.

- **Erro: "Operação não permitida", "Permissão negada" ou similares.**
  - **Causa:** Quando o sandboxing está habilitado, o Qwen Code pode tentar realizar operações restritas pela sua configuração de sandbox, como escrever fora do diretório do projeto ou do diretório temporário do sistema.
  - **Solução:** Consulte a documentação [Configuração: Sandboxing](../users/features/sandbox) para mais informações, incluindo como personalizar sua configuração de sandbox.

- **O Qwen Code não está sendo executado no modo interativo em ambientes "CI"**
  - **Problema:** O Qwen Code não entra no modo interativo (nenhum prompt aparece) se uma variável de ambiente começando com `CI_` (ex: `CI_TOKEN`) estiver definida. Isso ocorre porque o pacote `is-in-ci`, usado pelo framework de interface subjacente, detecta essas variáveis e assume um ambiente CI não interativo.
  - **Causa:** O pacote `is-in-ci` verifica a presença de `CI`, `CONTINUOUS_INTEGRATION` ou qualquer variável de ambiente com o prefixo `CI_`. Quando alguma dessas é encontrada, ele sinaliza que o ambiente é não interativo, impedindo que a CLI seja iniciada no modo interativo.
  - **Solução:** Se a variável com prefixo `CI_` não for necessária para o funcionamento da CLI, você pode removê-la temporariamente para o comando. Ex: `env -u CI_TOKEN qwen`

- **Modo DEBUG não funciona a partir do arquivo .env do projeto**
  - **Problema:** Definir `DEBUG=true` no arquivo `.env` de um projeto não ativa o modo de depuração para a CLI.
  - **Causa:** As variáveis `DEBUG` e `DEBUG_MODE` são automaticamente excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento da CLI.
  - **Solução:** Utilize um arquivo `.qwen/.env` em vez disso, ou configure a opção `advanced.excludedEnvVars` no seu `settings.json` para excluir menos variáveis.

## IDE Companion não está conectando

- Certifique-se de que o VS Code tem uma única pasta de workspace aberta.
- Reinicie o terminal integrado após instalar a extensão para que ele herde:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Se estiver rodando em um container, verifique se `host.docker.internal` resolve. Caso contrário, mapeie o host adequadamente.
- Reinstale o companion com `/ide install` e use "Qwen Code: Run" na Paleta de Comandos para verificar se ele é iniciado.

## Códigos de Saída

O Qwen Code utiliza códigos de saída específicos para indicar o motivo da finalização. Isso é especialmente útil para scripts e automação.

| Código de Saída | Tipo de Erro               | Descrição                                                    |
| --------------- | -------------------------- | ------------------------------------------------------------ |
| 41              | `FatalAuthenticationError` | Ocorreu um erro durante o processo de autenticação.          |
| 42              | `FatalInputError`          | Foi fornecida uma entrada inválida ou ausente à CLI. (somente no modo não interativo) |
| 44              | `FatalSandboxError`        | Ocorreu um erro com o ambiente de sandbox (por exemplo, Docker, Podman ou Seatbelt). |
| 52              | `FatalConfigError`         | Um arquivo de configuração (`settings.json`) é inválido ou contém erros. |
| 53              | `FatalTurnLimitedError`    | O número máximo de turnos conversacionais para a sessão foi atingido. (somente no modo não interativo) |

## Dicas de Depuração

- **Depuração via CLI:**
  - Use o flag `--verbose` (se disponível) com os comandos do CLI para obter uma saída mais detalhada.
  - Verifique os logs do CLI, geralmente encontrados em um diretório específico do usuário para configuração ou cache.

- **Depuração do core:**
  - Verifique a saída do console do servidor em busca de mensagens de erro ou stack traces.
  - Aumente o nível de detalhe dos logs, se configurável.
  - Utilize ferramentas de depuração do Node.js (ex.: `node --inspect`) caso precise percorrer passo a passo o código do lado do servidor.

- **Problemas com ferramentas:**
  - Se uma ferramenta específica estiver falhando, tente isolar o problema executando a versão mais simples possível do comando ou operação realizada pela ferramenta.
  - Para `run_shell_command`, verifique primeiro se o comando funciona diretamente no seu shell.
  - Para _ferramentas do sistema de arquivos_, confirme que os caminhos estão corretos e verifique as permissões.

- **Verificações prévias ao commit:**
  - Sempre execute `npm run preflight` antes de fazer commit do código. Isso pode detectar diversos problemas comuns relacionados à formatação, linting e erros de tipo.

## Issues existentes no GitHub semelhantes ao seu ou criando novos Issues

Se você encontrar um problema que não foi abordado aqui neste _Guia de solução de problemas_, considere pesquisar o [Rastreador de Issues do Qwen Code no GitHub](https://github.com/QwenLM/qwen-code/issues). Se não conseguir encontrar um issue semelhante ao seu, considere criar um novo Issue no GitHub com uma descrição detalhada. Pull requests também são bem-vindos!
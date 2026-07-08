# Design do comando Resolve

## Objetivo

Adicionar um comando `@qwen-code /resolve` acionado por mantenedores para pull requests bloqueados por conflitos de merge com o branch padrão.

## Escopo

A primeira versão é intencionalmente conservadora:

- O comando é executado apenas em `QwenLM/qwen-code`.
- O solicitante deve ter permissão de `write`, `maintain` ou `admin`.
- O destino deve ser um pull request aberto.
- O branch do pull request deve estar no repositório base.
- Pull requests de forks são reportados como não suportados em vez de receberem push.
- O agente não recebe nenhum token do GitHub. Ele só pode editar e fazer commit localmente.
- Uma etapa de publicação separada injeta `CI_DEV_BOT_PAT` para fazer push e comentar.

## Fluxo de trabalho

1. O workflow de comando de PR existente lida com `issue_comment` ou `workflow_dispatch` e resolve o pull request de destino.
2. Um job de autorização verifica a permissão de colaborador do solicitante com `CI_BOT_PAT`.
3. O job de resolve reconhece os gatilhos de comentário com uma reação de `eyes`.
4. O job lê os metadados do pull request e rejeita pull requests fechados, em rascunho, sem conflitos ou de forks.
5. Para pull requests elegíveis, o job faz checkout do branch do pull request com as credenciais persistidas desabilitadas, busca o branch base e verifica se o branch ainda aponta para o SHA head esperado.
6. O Qwen Code é executado sem credenciais do GitHub, faz o merge de `origin/<base>`, resolve os conflitos, verifica o resultado, faz o commit e escreve um artifact de resumo.
7. Uma etapa de verificação determinística falha em conflitos não resolvidos, resumo ausente ou checks com falha.
8. A etapa de publicação faz push com `--force-with-lease` contra o SHA head original e comenta com o resumo da resolução de conflitos.

## Fora do escopo

- Fazer push automático para pull requests de forks.
- Criação de pull requests substitutos para contribuidores externos.
- Varredura agendada de pull requests conflitantes inativos.
- Resolução de estados de não-mergeabilidade que não sejam conflitos de merge diretos.
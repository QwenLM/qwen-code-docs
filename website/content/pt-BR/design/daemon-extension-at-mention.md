# Suporte a menções de @extension no Daemon

## Objetivo

O Daemon WebShell deve corresponder ao comportamento de menção de extensões da CLI para extensões ativas. Os usuários podem descobrir extensões ativas a partir do `@` completion, selecionar uma menção canônica `@ext:<name>` e fazer com que o daemon injete o contexto dessa extensão no turno do modelo sem alterar o texto do prompt visível.

## Design

- O `@` completion do WebShell combina entradas de extensões ativas do status de extensões do workspace com correspondências de arquivos existentes no workspace. O `@` isolado mostra as extensões primeiro, `@bro` filtra extensões e arquivos, e `@ext:` alterna para completion apenas de extensões.
- O completion de extensões insere `@ext:<extension.name> ` para que o daemon receba uma referência estável, independente do texto de exibição.
- O status de extensões do Daemon inclui um campo opcional `description` populado a partir da configuração da extensão instalada. O campo é aditivo para clientes mais antigos.
- A resolução de prompt da sessão ACP verifica blocos de prompt de texto em busca de tokens `@ext:<name>`, corresponde apenas a extensões ativas da configuração da sessão, remove duplicatas de menções repetidas e ignora silenciosamente nomes desconhecidos ou inativos.
- O texto visível para o usuário é preservado exatamente. O contexto da extensão resolvida é anexado como partes de texto extras do modelo após o texto do usuário.
- A CLI e o daemon compartilham auxiliares de menção de extensões para parsing, sanitização do texto de exibição, formatação de capacidades e leitura de arquivos de contexto com validações de subcaminho e tamanho.

## Limites

As leituras de arquivos de contexto são limitadas por arquivo e pelo orçamento agregado de contexto de extensões. Arquivos fora do diretório da extensão instalada são ignorados, arquivos ilegíveis são ignorados com saída de debug, e menções repetidas consomem o orçamento apenas uma vez.

## Verificação

Testes direcionados cobrem os modos de completion do WebShell, injeção de contexto ACP do daemon, menções repetidas e desconhecidas, arquivos de contexto limitados e os processadores de menção de extensões da CLI existentes. A verificação final executa o build e o typecheck do repositório.
# Preservação de Memória Gerenciada na Microcompactação

## Problema

Os arquivos de tópico da memória gerenciada são carregados de forma preguiçosa com `read_file`. A microcompactação atualmente trata esses resultados como saída de ferramenta comum e substitui o conteúdo mais antigo por `[Old tool result content cleared]`. O índice de memória permanece disponível, e correções recentes fazem um `read_file` posterior retornar os bytes reais novamente, mas não há garantia de que o modelo ativo perceba que precisa recarregar a memória.

A issue #6487 também relata um índice obsoleto após `/remember`; o PR #6497 já cuida dessa parte. Este design trata apenas do conteúdo de memória gerenciada removido pela microcompactação.

## Design escolhido

Adicionar um callback restrito de `MicrocompactOptions` que identifica caminhos de `read_file` cujos resultados bem-sucedidos devem ser preservados. Antes de construir planos de limpeza ociosos, forçados ou baseados em tamanho, a microcompactação correlaciona cada resposta com o `file_path` do lado da requisição e remove os resultados protegidos do conjunto compactável. Outras ferramentas, leituras de arquivo comuns, erros e respostas cujo caminho não pode ser resolvido mantêm o comportamento atual.

Todos os pontos de entrada de microcompactação de produção fornecem o mesmo predicado:

- compactação ociosa pré-envio e baseada em tamanho
- `/compress-fast`
- compactação de histórico por pressão de memória

O predicado reconhece as raízes de memória gerenciada de projeto, usuário e equipe usando contenção ciente de realpath. Symlinks que escapam de uma raiz gerenciada não são protegidos.

## Por que este nível

Injetar o corpo de cada memória carregada na instrução do sistema faria a memória consumir contexto permanentemente e substituiria o design existente de índice mais leitura preguiçosa. Reanexar cada arquivo de memória após a compactação completa exigiria um orçamento de tokens e uma política de restauração separados. Preservar apenas as leituras de memória gerenciada da microcompactação corrige diretamente o comportamento de limpeza reproduzido com uma alteração limitada e deixa a compactação completa como a fronteira existente de redução forte de contexto.

A compactação completa, portanto, intencionalmente não preserva bytes. Seu resumo vê o conteúdo de memória pré-compactação, os índices `MEMORY.md` permanecem na instrução do sistema e o cache de leituras de arquivo é limpo para que o modelo possa recarregar os bytes exatos. Esta alteração garante preservação apenas ao longo da microcompactação.

## Riscos e testes

Leituras repetidas de arquivos de memória gerenciada podem reter múltiplas cópias até a compactação completa. Esse é um tradeoff intencional: orientação durável é mais importante do que recuperar esses tokens de resultado de ferramenta, enquanto a compactação completa permanece disponível como o teto rígido.

Os testes cobrem raízes de projeto, usuário e equipe; leituras comuns; escapes por symlink; caminhos ociosos, forçados e baseados em tamanho; resultados protegidos e compactáveis misturados; IDs de resposta ambíguos ou ausentes; e metadata de eviction.

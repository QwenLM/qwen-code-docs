# Cache de Tokens e Otimização de Custos

O Qwen Code otimiza automaticamente os custos da API por meio do cache de tokens ao usar autenticação por chave de API. Esse recurso armazena conteúdo frequentemente utilizado, como instruções do sistema e histórico de conversas, para reduzir o número de tokens processados em solicitações subsequentes.

## Benefícios para Você

- **Redução de custos**: Menos tokens resultam em custos menores com a API
- **Respostas mais rápidas**: O conteúdo em cache é recuperado mais rapidamente
- **Otimização automática**: Não é necessária configuração - funciona em segundo plano

## O cache de tokens está disponível para

- Usuários de chave de API (chave de API do Qwen, provedores compatíveis com OpenAI)

## Monitorando Sua Economia

Use o comando `/stats` para ver a economia de tokens em cache:

- Quando ativo, a exibição de estatísticas mostra quantos tokens foram servidos a partir do cache
- Você verá tanto o número absoluto quanto a porcentagem de tokens em cache
- Exemplo: "10.500 (90,4%) dos tokens de entrada foram servidos a partir do cache, reduzindo os custos."

Essa informação só é exibida quando tokens em cache estão sendo usados, o que ocorre com a autenticação por chave de API, mas não com a autenticação OAuth.

## Exemplo de Exibição de Estatísticas

![Exibição de Estatísticas do Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

A imagem acima mostra um exemplo da saída do comando `/stats`, destacando as informações sobre a economia de tokens em cache.
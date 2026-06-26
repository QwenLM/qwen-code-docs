# Cache de Tokens e Otimização de Custos

O Qwen Code otimiza automaticamente os custos de API por meio do cache de tokens ao usar autenticação via chave de API. Esse recurso armazena conteúdo usado com frequência, como instruções do sistema e histórico de conversas, para reduzir o número de tokens processados em solicitações subsequentes.

## Como Isso Beneficia Você

- **Redução de custos**: Menos tokens significam custos de API mais baixos
- **Respostas mais rápidas**: O conteúdo em cache é recuperado mais rapidamente
- **Otimização automática**: Nenhuma configuração necessária - funciona nos bastidores

## O cache de tokens está disponível para

- Usuários de chave de API (chave de API do Qwen, provedores compatíveis com OpenAI)

## Monitorando Suas Economias

Use o comando `/stats` para ver suas economias de tokens em cache:

- Quando ativo, a exibição de estatísticas mostra quantos tokens foram servidos do cache
- Você verá tanto o número absoluto quanto a porcentagem de tokens em cache
- Exemplo: "10.500 (90,4%) dos tokens de entrada foram servidos do cache, reduzindo custos."

Essas informações são exibidas apenas quando tokens em cache estão sendo usados, o que ocorre com autenticação via chave de API, mas não com autenticação OAuth.

## Exemplo de Exibição de Estatísticas

![Qwen Code Stats Display](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

A imagem acima mostra um exemplo da saída do comando `/stats`, destacando as informações de economia de tokens em cache.
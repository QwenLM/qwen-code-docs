# Cache de Tokens e Otimização de Custos

O Qwen Code otimiza automaticamente os custos da API por meio do cache de tokens ao usar autenticação com chave de API. Esse recurso armazena conteúdos frequentemente utilizados, como instruções do sistema e histórico de conversas, reduzindo o número de tokens processados em solicitações subsequentes.

## Como Isso Te Beneficia

- **Redução de custos**: Menos tokens significam menores custos na API
- **Respostas mais rápidas**: Conteúdo em cache é recuperado com maior velocidade
- **Otimização automática**: Nenhuma configuração necessária — funciona nos bastidores

## O cache de tokens está disponível para

- Usuários de chave de API (chave da API Qwen, provedores compatíveis com OpenAI)

## Monitorando suas economias

Use o comando `/stats` para ver suas economias de tokens em cache:

- Quando ativo, a exibição de estatísticas mostra quantos tokens foram servidos do cache
- Você verá tanto o número absoluto quanto a porcentagem de tokens em cache
- Exemplo: "10.500 (90,4%) dos tokens de entrada foram servidos do cache, reduzindo os custos."

Essas informações são exibidas apenas quando tokens em cache estão sendo usados, o que ocorre com autenticação via chave de API, mas não com autenticação OAuth.

## Exemplo de exibição de estatísticas

![Qwen Code Stats Display](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

A imagem acima mostra um exemplo da saída do comando `/stats`, destacando as informações de economia de tokens em cache.
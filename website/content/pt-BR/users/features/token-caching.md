# Cache de Tokens e Otimização de Custos

O Qwen Code otimiza automaticamente os custos da API por meio do cache de tokens ao usar autenticação com chave de API. Esse recurso armazena em cache conteúdos frequentemente utilizados, como instruções do sistema e histórico de conversas, reduzindo assim o número de tokens processados em requisições subsequentes.

## Como Isso Beneficia Você

- **Redução de custos**: Menos tokens significam custos menores na API  
- **Respostas mais rápidas**: Conteúdo em cache é recuperado com maior velocidade  
- **Otimização automática**: Nenhuma configuração necessária — funciona em segundo plano  

## O cache de tokens está disponível para

- Usuários com chave de API (chave de API do Qwen, provedores compatíveis com OpenAI)

## Monitorando Suas Economias

Use o comando `/stats` para ver suas economias de tokens em cache:

- Quando ativo, o painel de estatísticas mostra quantos tokens foram fornecidos a partir do cache  
- Você verá tanto o número absoluto quanto a porcentagem de tokens em cache  
- Exemplo: "10.500 (90,4%) dos tokens de entrada foram fornecidos a partir do cache, reduzindo os custos."

Essas informações são exibidas apenas quando tokens em cache estão sendo utilizados — o que ocorre com autenticação por chave de API, mas não com autenticação OAuth.

## Exemplo de Painel de Estatísticas

![Painel de Estatísticas do Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

A imagem acima mostra um exemplo da saída do comando `/stats`, destacando as informações sobre economia de tokens em cache.
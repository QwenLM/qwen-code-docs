# Identidade de Rota de Modelo ACP

## Problema

O Qwen Code atualmente expõe os IDs de modelo ACP como `modelId(authType)`.
Dois modelos configurados com o mesmo ID de modelo e tipo de auth, mas valores
de `baseUrl` diferentes, portanto colapsam em um seletor ACP único. Os
clientes não conseguem identificar a linha ativa nem fazer o round-trip de uma
seleção até o endpoint pretendido.

O Core já trata `(authType, modelId, baseUrl configurado)` como a identidade
do registro. A perda acontece apenas quando essa identidade cruza a fronteira
ACP. O valor configurado deve permanecer separado do endpoint resolvido porque
padrões do provedor podem preencher o `baseUrl` após o registro.

## Design

Construir as opções de modelo ACP a partir da lista existente de modelos
configurados:

- Manter `modelId(authType)` quando for único. Isso preserva os IDs existentes
  para o caso normal.
- Quando múltiplas opções compartilhariam esse ID, substituir cada uma por um
  seletor determinístico `qwen-route:v1:<digest>` derivado de metadados de
  modelo não secretos e da identidade pública do endpoint (credenciais, query
  e fragmento removidos).
- Rejeitar rotas que permanecem indistinguíveis após a sanitização em vez de
  usar a ordem do array, que poderia remapear um seletor antigo após
  reordenação de configuração.
- Continuar usando `ModelInfo.name` e metadados do provedor para exibição. O
  ID de rota é um seletor de máquina opaco.

O Core expõe o `baseUrl` opcional original do registro ao lado do endpoint de
exibição resolvido. O mesmo construtor de opções fornece modelos de sessão
ACP, opções de configuração, status do provedor ao vivo e status do provedor
de workspace do daemon, para que todo cliente veja o mesmo ID enquanto o
servidor mantém o discriminador exato do registro.

Em `session/set_model`, o Qwen Code resolve o seletor contra a lista atual de
modelos configurados antes de alternar. Ele passa o `baseUrl` resolvido ao
Core e então persiste apenas os valores canônicos de configurações:

- `model.name`: ID real do modelo
- `model.baseUrl`: endpoint configurado do registro, ou um tombstone vazio
  para um padrão implícito
- `security.auth.selectedType`: tipo real de auth

O seletor opaco nunca é gravado em `settings.json`.

## Compatibilidade

- O schema ACP não muda; `modelId` permanece uma string.
- IDs de modelo existentes únicos mantêm a representação de wire atual.
- Requisições legadas `modelId(authType)` continuam aceitas. Se tal ID for
  ambíguo, o comportamento existente de primeira correspondência é preservado
  para compatibilidade; seletores recém-anunciados são exatos.
- Seletores opacos desconhecidos ou obsoletos são rejeitados em vez de
  tratados como IDs literais de modelo.
- Clientes ACP genéricos, incluindo o Zed, só precisam ecoar o seletor opaco.
- As configurações e o comportamento de seleção da TUI do CLI não mudam.

## Verificação

- Rotas duplicadas recebem seletores distintos e estáveis sem vazar suas URLs.
- O estado de modelo da sessão e as opções de configuração publicam os mesmos
  seletores e a rota atual exata.
- Selecionar a segunda rota alterna com seu `baseUrl`, persiste as
  configurações canônicas e notifica os clientes com seu seletor opaco.
- O status de provedor do daemon identifica a rota atual exata para o Web
  Shell.
- Seleções de modelo únicas e legadas continuam funcionando.

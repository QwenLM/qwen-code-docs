# Filtragem de payload de modelo do MCP

## Objetivo

Impedir que `packages/cua-driver` e `packages/mobile-mcp` retornem termos
conhecidos do fornecedor em payloads MCP textuais, preservando os valores
locais reais necessários para operar apps, janelas, dispositivos e pacotes.

A filtragem é opt-in e desativada por padrão. Defina
`MCP_MODEL_PAYLOAD_FILTER=1` no ambiente do servidor MCP para rotas de API que
rejeitam esses termos. Usuários em outras rotas mantêm os payloads originais.

Os termos ASCII iniciais, sem distinção de maiúsculas/minúsculas, são
`qwen`, `dashscope`, `alibaba`, `aliyun`, `aliyuncs`, `alicloud`, `tongyi`,
`qianwen`, `antgroup`, `bailian`, `modelscope`, `damo`, `lingma`, `wanx`,
`alipay`, `antfin`, `yuque`, `dingtalk`, `taobao`, `tmall`, `qoder` e
`maxcompute`. Termos em chinês são correspondidos exatamente: `通义`, `千问`,
`阿里`, `百炼`, `魔搭`, `达摩`, `灵码`, `万相`, `支付宝`, `蚂蚁`, `语雀`,
`钉钉`, `淘宝` e `天猫`. Variantes de separador também são correspondidas
para nomes compostos, como `q-wen`, `dash_scope`, `ali cloud`, `qian-wen` e
`ant_group`.

## Codificação

Cada substring correspondida é substituída por um token sem estado contendo
seus bytes hex UTF-8. Por exemplo, um nome de app filtrado permanece legível
ao redor do token, e retornar esse valor ao mesmo servidor MCP restaura a
substring original exata antes da validação e execução de ferramenta. Isso
evita um mapa de sessão e mantém as idas e vindas de app/pacote/caminho
funcionando após reinicializações de processo.

IDs e métodos JSON-RPC nunca são transformados. Chaves de objeto e valores
textuais dentro de payloads de resultado, erro e notificação são transformados
recursivamente. Campos `data` de imagem e áudio são preservados byte a byte.

## Fronteiras de componente

No cua-driver, `Response::ok` e `Response::error` são a fronteira
compartilhada voltada ao modelo para respostas MCP de stdio direto, HTTP e
proxy de daemon. Nomes e argumentos de chamada de ferramenta são decodificados
em `Request::tool_call` antes do despacho. Ambas as direções aplicam a
transformação apenas quando `MCP_MODEL_PAYLOAD_FILTER=1`.

No mobile-mcp, um wrapper de transporte codifica payloads JSON-RPC de saída e
decodifica payloads de entrada antes que o SDK execute a validação de schema.
Uma pequena subclasse de `McpServer` aplica o wrapper a stdio, SSE, testes em
memória e transportes futuros quando `MCP_MODEL_PAYLOAD_FILTER=1`; caso
contrário, conecta o transporte original inalterado.

## Não objetivos

Isto não renomeia apps instalados, processos, bundles, pacotes npm,
identidades de assinatura, repositórios ou URLs de distribuição. Não
transforma stderr, telemetria ou logs de build. Bytes de imagem são
preservados, então filtragem baseada em OCR está fora desta garantia de
payload textual.

Aliases são decodificados apenas quando retornados ao mesmo componente MCP.
Passar um alias para um shell ou outro servidor não recupera o valor local.

## Verificação

- Testar unitariamente todo termo, maiúsculas/minúsculas mistas, texto em
  chinês, objetos aninhados e chaves, tokens inválidos, idas e vindas exatas e
  preservação de conteúdo binário.
- Verificar que a fronteira voltada ao modelo permanece inalterada por padrão
  e é filtrada apenas quando `MCP_MODEL_PAYLOAD_FILTER=1` está presente.
- Exercitar initialize real de MCP, tools/list, sucesso, sucesso estruturado e
  respostas de erro para ambos os componentes.
- Reexecutar os payloads observados de permissão, health, app e janela do cua
  e o eco determinístico de erro do mobile.

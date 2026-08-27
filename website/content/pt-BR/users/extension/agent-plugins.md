# Agent Plugins v1

O Qwen Code carrega nativamente pacotes portáteis do [Agent Plugins v1](https://agent-plugins.org/). O pacote mantém seus arquivos padrão `plugin.json`, `mcp.json` e `SKILL.md`: a instalação não gera `qwen-extension.json` nem reescreve arquivos portáteis.

Use os comandos de extensão existentes com um diretório local, link, arquivo, repositório Git, URL de arquivo ou pacote npm com escopo:

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

O manifesto raiz deve apontar para o schema canônico v1:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## Capabilities suportadas

| Capability                                 | Suporte                                  |
| ------------------------------------------ | ---------------------------------------- |
| `skills/*/SKILL.md` filho direto           | Sim                                      |
| Servidores MCP stdio                       | Sim                                      |
| Servidores MCP HTTP streamable             | Sim                                      |
| Servidores MCP HTTP+SSE legados            | Não; a entrada é ignorada                |
| Comandos, agentes e hooks                  | Não; esses diretórios são ignorados      |
| Contexto, configurações, canais e apps Qwen | Não                                     |
| Namespaces de cliente `extensions.*`       | Não; namespaces não implementados são ignorados |

Skills seguem a [especificação Agent Skills](https://agentskills.io/specification). Uma skill inválida é ignorada sem desabilitar skills irmãs válidas. O campo experimental `allowed-tools` é reconhecido como string, mas não concede ferramentas Qwen pré-aprovadas.

Para servidores MCP stdio, o Qwen Code expande `${PLUGIN_ROOT}` e `${PLUGIN_DATA}` uma vez em `args`, valores de ambiente e `cwd`. `PLUGIN_DATA` é um diretório gravável por instalação cujo conteúdo persiste entre atualizações e reinstalações. Endpoints MCP remotos devem usar HTTPS, exceto endpoints HTTP de loopback.

Agent Plugins v1 é um formato de pacote, não uma integração com marketplace. Instale pacotes através das fontes de extensão existentes do Qwen Code.

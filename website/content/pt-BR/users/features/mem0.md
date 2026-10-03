# Mem0

O Mem0 conecta o Qwen Code a um serviço de memória externo. Ele está incluído no pacote principal do CLI: não instale `@qwen-code/external-context-mem0` nem registre um servidor MCP separado para este caminho.

## Conectar

Mescle isso nas configurações do usuário (`~/.qwen/settings.json`) e reinicie o Qwen Code em um projeto confiável. Assim como `modelProviders`, `envKey` nomeia a variável de credencial e o campo `env` de nível superior pode fornecer seu valor:

```json
{
  "env": {
    "MEM0_API_KEY": "<your-provider-key>"
  },
  "memory": {
    "mem0": {
      "baseUrl": "https://your-mem0-endpoint.example",
      "protocol": "mem0-v2",
      "envKey": "MEM0_API_KEY"
    }
  }
}
```

Essa configuração de arquivo único não requer uma exportação no shell. Credenciais em JSON são texto plano: mantenha-as nas configurações do usuário, não faça commit em um repositório e evite compartilhar o arquivo em relatórios. Alternativamente, omita a entrada `env` de nível superior e defina a chave no shell de inicialização ou em `~/.qwen/.env`. Valores de ambiente do processo não vazios têm precedência sobre os valores de `.env`, que têm precedência sobre `settings.env`.

Use a origem do endpoint, opcionalmente com um prefixo de proxy reverso; não anexe `/v2/memories/search` ou outro caminho de operação. Escolha o contrato que seu serviço realmente implementa:

- `mem0-v2` (padrão): estilo PolarDB com `Authorization: Token`, busca V2 usando `limit`, escrita V1.
- `mem0-v3`: Mem0 Platform V3, `Authorization: Token`, busca/adicao V3.
- `mem0-oss-2026-08`: contrato REST OSS fixado, `X-API-Key`, `/search` e `/memories`.

Estes são contratos completos, não compatibilidade universal de versões. Versões desconhecidas e formatos diferentes de requisição/resposta precisam de um adaptador verificado, não de uma URL renomeada. IDs de preset históricos permanecem aceitos; `aliyun-polardb-mysql-2026-08` preserva seu campo de busca `top_k` histórico e conteúdo de busca bruto.

Um endereço PolarDB confiável como `http://your-endpoint:8080` também precisa de `"allowInsecureHttp": true`. HTTP puro envia a credencial sem criptografia. Essa configuração não torna um endpoint privado acessível nem contorna whitelists de IP.

O Qwen registra automaticamente o `external-context` e descobre o `context_search`. Peça ao Qwen para buscar na memória externa; nada é recuperado ou enviado automaticamente a cada turno. Um servidor com o mesmo nome nas configurações do operador, na configuração de sessão ou em `--mcp-config` gera conflito; remova essa configuração manual ao migrar para o caminho integrado. Configurações de workspace e entradas de projeto `.mcp.json` com esse nome são sobrescritas. A precedência existente de MCP também sobrepõe um servidor de extensão com o mesmo nome, portanto desative a extensão avançada de external-context ao usar o caminho incluído. Remova também o Hook manual antigo de confirmação de escrita para evitar confirmações duplicadas; um Hook de usuário com o mesmo matcher não substitui a confirmação incluída.

## Escopo e escritas

O escopo padrão de usuário/repositório sobrevive a reinícios e a partir de subdiretórios do Git. Mover o repositório ou usar outro checkout o altera, incluindo worktrees temporários com `--worktree` e worktrees de isolamento de agente. Para reutilizar um escopo conhecido entre worktrees, defina `scope.userId` para V2/OSS ou `scope.appId` para V3; o `scope.agentId` opcional se aplica apenas a V2/OSS. Identificadores de escopo não são controles de acesso no lado do provedor.

A busca é somente leitura por padrão. Para ativar o salvamento, adicione `"enableWrites": true` dentro de `memory.mem0`, reinicie o CLI interativo e peça ao Qwen para salvar conteúdo específico. O Hook instalado automaticamente solicita a aprovação do conteúdo exato, inclusive no modo YOLO. Rejeitar não envia nenhuma requisição de escrita. Escritas usam `infer: false`.

O PolarDB pode retornar um array de mensagens de usuário único codificado como JSON para essas importações diretas. O `mem0-v2` restaura o texto exato dessa mensagem quando o resultado está marcado como `infer: false`; o preset histórico `aliyun-polardb-mysql-2026-08`, texto comum e outros protocolos permanecem inalterados.

Sessões não interativas/ACP e sessões com Hooks desativados mantêm apenas a busca. Modo bare/safe, pastas não confiáveis/provisórias e workspaces SSH não ativam esta vinculação local. Configurações de workspace não podem configurar a vinculação.

`stored` significa que IDs síncronos válidos foram retornados. `accepted` significa que uma requisição assíncrona foi aceita, não que a persistência foi concluída. `failed` significa uma rejeição definitiva: corrija a causa reportada antes de tentar novamente. `unknown` significa que a escrita pode ter ocorrido: não tente novamente automaticamente.

## Opções e solução de problemas

`envKey` tem como padrão `MEM0_API_KEY`; use-o para referenciar outra variável de credencial e definir esse valor por meio de qualquer uma das fontes acima. O campo histórico `credentialEnv` permanece como um alias compatível. Se ambos os campos estiverem definidos, seus nomes devem corresponder; nomes conflitantes geram um erro em vez de selecionar silenciosamente uma credencial. `timeoutMs` tem como padrão 5000, entre 1 e 30000.

Verifique o status da conexão MCP para credenciais ausentes e erros do provedor. Um timeout requer verificar o roteamento do endpoint, whitelists de IP de origem e disponibilidade do serviço. Um 401/403 requer verificar a credencial e o protocolo selecionado. Não cole credenciais em logs ou relatórios de issues.

Para checkouts de código-fonte, faça build e bundle uma vez para que `dist/mem0/main.js` e `dist/mem0/write-confirmation.js` existam. Pacotes principais instalados incluem ambos. Este recurso precisa de uma release principal do CLI contendo a alteração; não é necessário publicar um pacote Mem0 independente.
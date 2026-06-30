# Plugins de Canais Personalizados

Você pode estender o sistema de canais com adaptadores de plataforma personalizados empacotados como [extensões](../../extension/introduction). Isso permite conectar o Qwen Code a qualquer plataforma de mensagens, webhook ou transporte personalizado.

## Como Funciona

Os plugins de canais são carregados na inicialização a partir das extensões ativas. Quando `qwen channel start` é executado, ele:

1. Verifica todas as extensões habilitadas em busca de entradas `channels` em seus arquivos `qwen-extension.json`
2. Importa dinamicamente o ponto de entrada de cada canal
3. Registra o tipo de canal para que possa ser referenciado no `settings.json`
4. Cria instâncias de canal usando a função de fábrica do plugin

Seu canal personalizado obtém gratuitamente todo o pipeline compartilhado: controle de remetentes, políticas de grupo, roteamento de sessões, comandos slash, recuperação de falhas e uma ponte de agente. O `qwen channel start` autônomo atualmente fornece o `AcpBridge`; o código do adaptador do plugin deve depender do contrato `ChannelAgentBridge` voltado para o adaptador. Plugins TypeScript existentes com um parâmetro de ponte `AcpBridge` explícito devem migrar essa anotação para `ChannelAgentBridge`; plugins JavaScript não são afetados em tempo de execução.

## Instalando um Canal Personalizado

Instale uma extensão que forneça um plugin de canal:

```bash
# A partir de um caminho local (para desenvolvimento ou plugins privados)
qwen extensions install /path/to/my-channel-extension

# Ou faça o link para desenvolvimento (as alterações são refletidas imediatamente)
qwen extensions link /path/to/my-channel-extension
```

## Configurando um Canal Personalizado

Adicione uma entrada de canal ao `~/.qwen/settings.json` usando o tipo personalizado fornecido pela extensão:

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

O `type` deve corresponder a um tipo de canal registrado por uma extensão instalada. Verifique a documentação da extensão para saber quais campos específicos do plugin são obrigatórios (por exemplo, `apiKey`, `webhookUrl`).

Todas as opções padrão de canal funcionam com canais personalizados:

| Opção          | Descrição                                      |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` ou `open`               |
| `allowedUsers` | Lista de permissões estática de IDs de remetentes |
| `sessionScope` | `user`, `thread` ou `single`                   |
| `cwd`          | Diretório de trabalho para o agente            |
| `instructions` | Prefixado à primeira mensagem de cada sessão   |
| `model`        | Substituição do modelo para o canal            |
| `groupPolicy`  | `disabled`, `allowlist` ou `open`              |
| `groups`       | Configurações por grupo                        |

Consulte a [Visão Geral](./overview) para obter detalhes sobre cada opção.

## Iniciando o Canal

```bash
# Inicia todos os canais, incluindo os personalizados
qwen channel start

# Inicia apenas o seu canal personalizado
qwen channel start my-bot
```

## O Que Você Obtém Gratuitamente

Os canais personalizados suportam automaticamente tudo o que os canais integrados suportam:

- **Políticas de remetentes** — Controle de acesso `allowlist`, `pairing` e `open`
- **Políticas de grupo** — Configurações por grupo com controle opcional por @menção
- **Roteamento de sessões** — Sessões por usuário, por thread ou compartilhadas únicas
- **Pareamento de DM** — Fluxo completo de código de pareamento para usuários desconhecidos
- **Comandos slash** — `/help`, `/clear`, `/status` funcionam imediatamente
- **Instruções personalizadas** — Prefixadas à primeira mensagem em cada sessão
- **Recuperação de falhas** — Reinicialização automática com preservação da sessão
- **Serialização por sessão** — As mensagens são enfileiradas para evitar condições de corrida

## Criando Seu Próprio Plugin de Canal

Quer criar um plugin de canal para uma nova plataforma? Consulte o [Guia do Desenvolvedor de Plugins de Canal](../../../developers/channel-plugins.md) para ver a interface `ChannelPlugin`, o formato `Envelope` e os pontos de extensão.
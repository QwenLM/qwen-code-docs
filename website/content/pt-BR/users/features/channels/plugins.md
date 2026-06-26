# Plugins de Canal Personalizados

Você pode estender o sistema de canais com adaptadores de plataforma personalizados empacotados como [extensões](../../extension/introduction). Isso permite conectar o Qwen Code a qualquer plataforma de mensagens, webhook ou transporte personalizado.

## Como Funciona

Os plugins de canal são carregados na inicialização a partir de extensões ativas. Quando `qwen channel start` é executado, ele:

1. Escaneia todas as extensões habilitadas em busca de entradas `channels` em seus `qwen-extension.json`
2. Importa dinamicamente o ponto de entrada de cada canal
3. Registra o tipo de canal para que possa ser referenciado em `settings.json`
4. Cria instâncias de canal usando a função fábrica do plugin

Seu canal personalizado recebe todo o pipeline compartilhado gratuitamente: controle de remetente, políticas de grupo, roteamento de sessão, comandos de barra, recuperação de falhas e a ponte ACP para o agente.

## Instalando um Canal Personalizado

Instale uma extensão que forneça um plugin de canal:

```bash
# A partir de um caminho local (para desenvolvimento ou plugins privados)
qwen extensions install /caminho/para/minha-extensao-canal

# Ou vincule para desenvolvimento (as alterações são refletidas imediatamente)
qwen extensions link /caminho/para/minha-extensao-canal
```

## Configurando um Canal Personalizado

Adicione uma entrada de canal em `~/.qwen/settings.json` usando o tipo personalizado fornecido pela extensão:

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

O `type` deve corresponder a um tipo de canal registrado por uma extensão instalada. Consulte a documentação da extensão para saber quais campos específicos do plugin são necessários (ex.: `apiKey`, `webhookUrl`).

Todas as opções padrão de canal funcionam com canais personalizados:

| Opção           | Descrição                                                 |
| --------------- | --------------------------------------------------------- |
| `senderPolicy`  | `allowlist`, `pairing` ou `open`                         |
| `allowedUsers`  | Lista de permissões estática de IDs de remetentes        |
| `sessionScope`  | `user`, `thread` ou `single`                             |
| `cwd`           | Diretório de trabalho para o agente                      |
| `instructions`  | Adicionado ao início da primeira mensagem de cada sessão |
| `model`         | Substituição de modelo para o canal                      |
| `groupPolicy`   | `disabled`, `allowlist` ou `open`                        |
| `groups`        | Configurações por grupo                                  |

Veja [Visão Geral](./overview) para detalhes sobre cada opção.

## Iniciando o Canal

```bash
# Inicia todos os canais, incluindo os personalizados
qwen channel start

# Inicia apenas seu canal personalizado
qwen channel start my-bot
```

## O que você ganha de graça

Canais personalizados suportam automaticamente tudo que os canais integrados fazem:

- **Políticas de remetente** — Controle de acesso `allowlist`, `pairing` e `open`
- **Políticas de grupo** — Configurações por grupo com controle opcional de @menção
- **Roteamento de sessão** — Sessões por usuário, por thread ou compartilhadas únicas
- **Emparelhamento DM** — Fluxo completo de código de emparelhamento para usuários desconhecidos
- **Comandos de barra** — `/help`, `/clear`, `/status` funcionam imediatamente
- **Instruções personalizadas** — Adicionadas ao início da primeira mensagem em cada sessão
- **Recuperação de falhas** — Reinicialização automática com preservação da sessão
- **Serialização por sessão** — Mensagens são enfileiradas para evitar condições de corrida

## Construindo Seu Próprio Plugin de Canal

Quer construir um plugin de canal para uma nova plataforma? Veja o [Guia do Desenvolvedor de Plugins de Canal](../../../developers/channel-plugins.md) para a interface `ChannelPlugin`, o formato `Envelope` e pontos de extensão.

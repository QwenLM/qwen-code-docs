# Plugins de Canal Personalizados

Você pode estender o sistema de canais com adaptadores de plataforma personalizados empacotados como [extensões](../../extension/introduction). Isso permite conectar o Qwen Code a qualquer plataforma de mensagens, webhook ou transporte personalizado.

## Como Funciona

Os plugins de canal são carregados na inicialização a partir das extensões ativas. Quando `qwen channel start` é executado, ele:

1. Verifica todas as extensões habilitadas em busca de entradas `channels` nos arquivos `qwen-extension.json`
2. Importa dinamicamente o ponto de entrada de cada canal
3. Registra o tipo de canal para que ele possa ser referenciado no `settings.json`
4. Cria instâncias do canal usando a função factory do plugin

Seu canal personalizado recebe todo o pipeline compartilhado automaticamente: filtragem de remetente, políticas de grupo, roteamento de sessão, comandos de barra, recuperação de falhas e a ponte ACP para o agente.

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

O `type` deve corresponder a um tipo de canal registrado por uma extensão instalada. Consulte a documentação da extensão para saber quais campos específicos do plugin são obrigatórios (por exemplo, `apiKey`, `webhookUrl`).

Todas as opções padrão de canal funcionam com canais personalizados:

| Opção          | Descrição                                            |
| -------------- | ---------------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` ou `open`                     |
| `allowedUsers` | Lista estática de permissão de IDs de remetente      |
| `sessionScope` | `user`, `thread` ou `single`                         |
| `cwd`          | Diretório de trabalho para o agente                  |
| `instructions` | Anexado no início da primeira mensagem de cada sessão|
| `model`        | Substituição do modelo para o canal                  |
| `groupPolicy`  | `disabled`, `allowlist` ou `open`                    |
| `groups`       | Configurações por grupo                              |

Consulte [Visão Geral](./overview) para detalhes sobre cada opção.

## Iniciando o Canal

```bash
# Inicia todos os canais, incluindo os personalizados
qwen channel start

# Inicia apenas o seu canal personalizado
qwen channel start my-bot
```

## Recursos Incluídos Automaticamente

Canais personalizados suportam automaticamente tudo o que os canais nativos oferecem:

- **Políticas de remetente** — Controle de acesso `allowlist`, `pairing` e `open`
- **Políticas de grupo** — Configurações por grupo com controle opcional via @mention
- **Roteamento de sessão** — Sessões por usuário, por thread ou uma única sessão compartilhada
- **Pareamento via DM** — Fluxo completo de código de pareamento para usuários desconhecidos
- **Comandos de barra** — `/help`, `/clear`, `/status` funcionam prontos para uso
- **Instruções personalizadas** — Anexadas no início da primeira mensagem de cada sessão
- **Recuperação de falhas** — Reinicialização automática com preservação da sessão
- **Serialização por sessão** — As mensagens são enfileiradas para evitar condições de corrida

## Criando Seu Próprio Plugin de Canal

Quer criar um plugin de canal para uma nova plataforma? Consulte o [Guia do Desenvolvedor de Plugins de Canal](/developers/channel-plugins) para conhecer a interface `ChannelPlugin`, o formato `Envelope` e os pontos de extensão.
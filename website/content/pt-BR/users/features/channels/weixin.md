# WeChat (Weixin)

Este guia cobre a configuração de um canal Qwen Code no WeChat por meio da API oficial do iLink Bot.

## Pré-requisitos

- Uma conta WeChat que possa escanear QR codes (aplicativo móvel)
- Acesso à plataforma iLink Bot (API oficial de bots do WeChat)

## Configuração

### 1. Faça login via QR code

O WeChat usa autenticação por QR code em vez de um token de bot estático. Execute o comando de login:

```bash
qwen channel configure-weixin
```

Isso exibirá uma URL de QR code. Escaneie-a com seu aplicativo WeChat no celular para autenticar. Suas credenciais são salvas em `~/.qwen/channels/weixin/account.json`.

### 2. Configure o canal

Adicione o canal ao `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

Nota: Canais WeChat não usam um campo `token` — as credenciais vêm da etapa de login via QR code.

### 3. Inicie o canal

```bash
# Iniciar apenas o canal WeChat
qwen channel start my-weixin

# Ou iniciar todos os canais configurados juntos
qwen channel start
```

Abra o WeChat e envie uma mensagem para o bot. Você deve ver um indicador de digitação ("...") enquanto o agente processa, seguido pela resposta.

## Imagens e Arquivos

Você pode enviar fotos e documentos para o bot, não apenas texto.

**Fotos:** Envie uma imagem (captura de tela, foto etc.) e o agente a analisará usando suas capacidades de visão. Isso requer um modelo multimodal — adicione `"model": "qwen3.5-plus"` (ou outro modelo com capacidade de visão) à configuração do seu canal. Um indicador de digitação aparece enquanto a imagem está sendo baixada e processada.

**Arquivos:** Envie um PDF, arquivo de código ou qualquer documento. O bot baixa e descriptografa o arquivo do CDN do WeChat, salva localmente, e o agente o lê com suas ferramentas de arquivo. Isso funciona com qualquer modelo.

## Opções de Configuração

Canais WeChat suportam todas as opções padrão de canal (consulte [Visão Geral do Canal](./overview#options)), além de:

| Opção     | Descrição                                                                          |
| --------- | ---------------------------------------------------------------------------------- |
| `baseUrl` | Substitui a URL base da API iLink Bot (padrão: `https://ilinkai.weixin.qq.com`)    |

## Principais Diferenças do Telegram

- **Autenticação:** Login via QR code em vez de um token de bot estático. As sessões podem expirar — o canal pausará e registrará uma mensagem se isso ocorrer.
- **Formatação:** O WeChat só suporta texto simples. O Markdown nas respostas do agente é removido automaticamente.
- **Indicador de digitação:** O WeChat tem um indicador nativo de "..." em vez de uma mensagem de texto "Trabalhando...".
- **Grupos:** O iLink Bot do WeChat funciona apenas em mensagens diretas — grupos não são suportados.
- **Criptografia de mídia:** Imagens e arquivos são criptografados no CDN do WeChat com AES-128-ECB. O canal lida com a descriptografia de forma transparente.

## Dicas

- **Use instruções em texto simples** — Como o WeChat remove todo Markdown, adicione instruções como "Use apenas texto simples" para evitar que o agente produza respostas formatadas que fiquem bagunçadas.
- **Mantenha as respostas curtas** — As bolhas de mensagem do WeChat funcionam melhor com texto conciso. Adicionar um limite de caracteres às suas instruções ajuda (ex.: "Mantenha respostas com menos de 500 caracteres").
- **Expiração de sessão** — Se você vir "Session expired (errcode -14)" nos logs, seu login do WeChat expirou. Pare o canal e execute `qwen channel configure-weixin` novamente para fazer login.
- **Restrinja o acesso** — Use `senderPolicy: "pairing"` ou `"allowlist"` para controlar quem pode falar com o bot. Veja [Pareamento de DM](./overview#dm-pairing) para detalhes.

## Solução de Problemas

### "WeChat account not configured"

Execute `qwen channel configure-weixin` para fazer login via QR code primeiro.

### "Session expired (errcode -14)"

Sua sessão de login do WeChat expirou. Pare o canal e execute `qwen channel configure-weixin` novamente.

### O bot não responde

- Verifique a saída do terminal em busca de erros
- Confirme que o canal está em execução (`qwen channel start my-weixin`)
- Se estiver usando `senderPolicy: "allowlist"`, certifique-se de que seu ID de usuário do WeChat está em `allowedUsers`

### Imagens não funcionam

- Certifique-se de que a configuração do seu canal tenha um `model` que suporte visão (ex.: `qwen3.5-plus`)
- Verifique o terminal em busca de erros de download do CDN — eles podem indicar um problema de rede
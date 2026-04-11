# WeChat (Weixin)

Este guia aborda a configuração de um canal do Qwen Code no WeChat por meio da API oficial do iLink Bot.

## Pré-requisitos

- Uma conta no WeChat capaz de escanear códigos QR (aplicativo móvel)
- Acesso à plataforma iLink Bot (API oficial de bots do WeChat)

## Configuração

### 1. Login via código QR

O WeChat usa autenticação por código QR em vez de um token estático de bot. Execute o comando de login:

```bash
qwen channel configure-weixin
```

Isso exibirá uma URL com um código QR. Escaneie-o com o aplicativo móvel do WeChat para autenticar. Suas credenciais são salvas em `~/.qwen/channels/weixin/account.json`.

### 2. Configurar o canal

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
      "instructions": "Você é um assistente de programação conciso que responde via WeChat. Mantenha as respostas com menos de 500 caracteres. Use apenas texto simples."
    }
  }
}
```

Nota: Canais do WeChat não usam o campo `token` — as credenciais vêm da etapa de login por QR.

### 3. Iniciar o canal

```bash
# Iniciar apenas o canal do WeChat
qwen channel start my-weixin

# Ou iniciar todos os canais configurados juntos
qwen channel start
```

Abra o WeChat e envie uma mensagem para o bot. Você deve ver um indicador de digitação ("...") enquanto o agente processa, seguido pela resposta.

## Imagens e Arquivos

Você pode enviar fotos e documentos para o bot, não apenas texto.

**Fotos:** Envie uma imagem (captura de tela, foto, etc.) e o agente a analisará usando seus recursos de visão. Isso requer um modelo multimodal — adicione `"model": "qwen3.5-plus"` (ou outro modelo com suporte a visão) à configuração do seu canal. Um indicador de digitação aparece enquanto a imagem é baixada e processada.

**Arquivos:** Envie um PDF, arquivo de código ou qualquer documento. O bot baixa e descriptografa o arquivo do CDN do WeChat, salva-o localmente e o agente o lê usando suas ferramentas de arquivo. Isso funciona com qualquer modelo.

## Opções de Configuração

Os canais do WeChat suportam todas as opções padrão de canal (consulte [Visão Geral do Canal](./overview#options)), além de:

| Opção     | Descrição                                                                      |
| --------- | ------------------------------------------------------------------------------ |
| `baseUrl` | Substitui a URL base da API do iLink Bot (padrão: `https://ilinkai.weixin.qq.com`) |

## Principais Diferenças em Relação ao Telegram

- **Autenticação:** Login por código QR em vez de um token estático de bot. As sessões podem expirar — o canal será pausado e registrará uma mensagem no log se isso acontecer.
- **Formatação:** O WeChat suporta apenas texto simples. O Markdown nas respostas do agente é removido automaticamente.
- **Indicador de digitação:** O WeChat possui um indicador nativo de digitação "..." em vez de uma mensagem de texto "Trabalhando...".
- **Grupos:** O iLink Bot do WeChat funciona apenas no modo DM — chats em grupo não são suportados.
- **Criptografia de mídia:** Imagens e arquivos são criptografados no CDN do WeChat com AES-128-ECB. O canal lida com a descriptografia de forma transparente.

## Dicas

- **Use instruções em texto simples** — Como o WeChat remove todo o Markdown, adicione instruções como "Use apenas texto simples" para evitar que o agente gere respostas formatadas que fiquem desorganizadas.
- **Mantenha as respostas curtas** — Os balões de mensagem do WeChat funcionam melhor com texto conciso. Adicionar um limite de caracteres às suas instruções ajuda (ex.: "Mantenha as respostas com menos de 500 caracteres").
- **Expiração de sessão** — Se você vir "Session expired (errcode -14)" nos logs, seu login no WeChat expirou. Pare o canal e execute `qwen channel configure-weixin` novamente para fazer login.
- **Restringir acesso** — Use `senderPolicy: "pairing"` ou `"allowlist"` para controlar quem pode interagir com o bot. Consulte [Emparelhamento DM](./overview#dm-pairing) para detalhes.

## Solução de Problemas

### "WeChat account not configured"

Execute `qwen channel configure-weixin` para fazer login via código QR primeiro.

### "Session expired (errcode -14)"

Sua sessão de login no WeChat expirou. Pare o canal e execute `qwen channel configure-weixin` novamente.

### O bot não responde

- Verifique a saída do terminal em busca de erros
- Verifique se o canal está em execução (`qwen channel start my-weixin`)
- Se estiver usando `senderPolicy: "allowlist"`, certifique-se de que seu ID de usuário do WeChat esteja em `allowedUsers`

### Imagens não funcionam

- Certifique-se de que a configuração do seu canal tenha um `model` que suporte visão (ex.: `qwen3.5-plus`)
- Verifique o terminal em busca de erros de download do CDN — eles podem indicar um problema de rede
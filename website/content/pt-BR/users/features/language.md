# Internacionalização (i18n) e Idioma

O Qwen Code é construído para fluxos de trabalho multilíngues: ele suporta localização da interface do usuário (i18n/l10n) na CLI, permite escolher o idioma de saída do assistente e permite pacotes de idioma personalizados para a interface.

## Visão Geral

Do ponto de vista do usuário, a "internacionalização" do Qwen Code abrange múltiplas camadas:

| Capacidade / Configuração | O que controla | Onde é armazenado |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui` | Texto da interface no terminal (menus, mensagens do sistema, prompts) | `~/.qwen/settings.json` |
| `/language output` | Idioma em que a IA responde (uma preferência de saída, não tradução da interface) | `~/.qwen/output-language.md` |
| Pacotes de idioma personalizados | Substituições/extensões das traduções da interface embutidas | `~/.qwen/locales/*.js` |

## Idioma da Interface

Esta é a camada de localização da interface do CLI (i18n/l10n): controla o idioma dos menus, prompts e mensagens do sistema.

### Configurando o Idioma da Interface

Utilize o comando `/language ui`:

```bash
/language ui zh-CN    # Chinês
/language ui en-US    # Inglês
/language ui ru-RU    # Russo
/language ui de-DE    # Alemão
/language ui ja-JP    # Japonês
```

Aliases também são suportados:

```bash
/language ui zh       # Chinês
/language ui en       # Inglês
/language ui ru       # Russo
/language ui de       # Alemão
/language ui ja       # Japonês
```

### Detecção Automática

Na primeira inicialização, o Qwen Code detecta a localidade do seu sistema e define automaticamente o idioma da interface.

Prioridade na detecção:

1. Variável de ambiente `QWEN_CODE_LANG`
2. Variável de ambiente `LANG`
3. Localidade do sistema via API Intl do JavaScript
4. Padrão: Inglês

## Idioma da Saída do LLM

O idioma da saída do LLM controla em qual idioma o assistente de IA responde, independentemente do idioma em que você digita suas perguntas.

### Como Funciona

O idioma de saída da LLM é controlado por um arquivo de regras em `~/.qwen/output-language.md`. Este arquivo é incluído automaticamente no contexto da LLM durante a inicialização, instruindo-a a responder no idioma especificado.

### Detecção Automática

Na primeira inicialização, se o arquivo `output-language.md` não existir, o Qwen Code cria um automaticamente com base na localidade do seu sistema. Por exemplo:

- A localidade do sistema `zh` cria uma regra para respostas em chinês
- A localidade do sistema `en` cria uma regra para respostas em inglês
- A localidade do sistema `ru` cria uma regra para respostas em russo
- A localidade do sistema `de` cria uma regra para respostas em alemão
- A localidade do sistema `ja` cria uma regra para respostas em japonês

### Configuração Manual

Use `/language output <idioma>` para alterar:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Qualquer nome de idioma funciona. O LLM será instruído a responder nesse idioma.

> [!note]
>
> Após alterar o idioma de saída, reinicie o Qwen Code para que a alteração tenha efeito.

### Localização do Arquivo

```
~/.qwen/output-language.md
```

## Configuração

### Via Diálogo de Configurações

1. Execute `/settings`
2. Encontre "Language" em General
3. Selecione seu idioma de interface preferido

### Via Variável de Ambiente

```bash
export QWEN_CODE_LANG=zh
```

Isso influencia a detecção automática na primeira inicialização (caso você não tenha definido um idioma de interface e ainda não exista o arquivo `output-language.md`).

## Pacotes de Idioma Personalizados

Para traduções da interface, você pode criar pacotes de idioma personalizados em `~/.qwen/locales/`:

- Exemplo: `~/.qwen/locales/es.js` para espanhol
- Exemplo: `~/.qwen/locales/fr.js` para francês

O diretório do usuário tem precedência sobre as traduções embutidas.

> [!tip]
>
> Contribuições são bem-vindas! Se você quiser melhorar as traduções embutidas ou adicionar novos idiomas.
> Para um exemplo concreto, veja [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Formato do Pacote de Idioma

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuración',
  // ... mais traduções
};
```

## Comandos Relacionados

- `/language` - Mostrar configurações de idioma atuais
- `/language ui [lang]` - Definir idioma da interface
- `/language output <language>` - Definir idioma de saída da LLM
- `/settings` - Abrir diálogo de configurações